import { Loader } from "@mantine/core";
import { useTimeout } from "@mantine/hooks";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import {
	PipecatClientProvider,
	usePipecatClient,
} from "@pipecat-ai/client-react";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { ThemeProvider, UserAudioComponent } from "@pipecat-ai/voice-ui-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	useAddHistoryEntry,
	useServerUrl,
	useSetServerLLMProvider,
	useSetServerPromptSections,
	useSetServerSTTProvider,
	useSettings,
	useTypeText,
} from "./lib/queries";
import { type ConnectionState, tauriAPI } from "./lib/tauri";
import { useRecordingStore } from "./stores/recordingStore";
import "./app.css";

function isTranscriptMessage(
	msg: unknown,
): msg is { type: "transcript"; text: string } {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		"text" in msg &&
		(msg as { type: unknown }).type === "transcript" &&
		typeof (msg as { text: unknown }).text === "string"
	);
}

function isRecordingCompleteMessage(
	msg: unknown,
): msg is { type: "recording-complete"; hasContent: boolean } {
	return (
		typeof msg === "object" &&
		msg !== null &&
		"type" in msg &&
		(msg as { type: unknown }).type === "recording-complete"
	);
}

function RecordingControl() {
	const client = usePipecatClient();
	const {
		state,
		setClient,
		startRecording,
		stopRecording,
		handleResponse,
		handleConnected,
		handleDisconnected,
	} = useRecordingStore();
	const containerRef = useRef<HTMLDivElement>(null);

	// Refs for click vs drag detection
	const isDraggingRef = useRef<boolean>(false);
	const mouseDownPositionRef = useRef<{ x: number; y: number } | null>(null);
	const hasDragStartedRef = useRef<boolean>(false);

	const { data: serverUrl } = useServerUrl();
	const { data: settings } = useSettings();

	// Track if we've ever connected (to distinguish initial connection from reconnection)
	const hasConnectedRef = useRef(false);

	// Simple connection: just call connect() when client and serverUrl are ready
	// SmallWebRTC handles reconnection internally (3 attempts)
	useEffect(() => {
		if (!client || !serverUrl) return;

		console.log("[Pipecat] Connecting to server...");
		client
			.connect({ webrtcRequestParams: { endpoint: `${serverUrl}/api/offer` } })
			.catch((error: unknown) => {
				console.error("[Pipecat] Initial connection failed:", error);
			});
	}, [client, serverUrl]);

	// TanStack Query hooks
	const typeTextMutation = useTypeText();
	const addHistoryEntry = useAddHistoryEntry();
	const setServerPromptSections = useSetServerPromptSections();
	const setServerSTTProvider = useSetServerSTTProvider();
	const setServerLLMProvider = useSetServerLLMProvider();

	// Response timeout (10s)
	const { start: startResponseTimeout, clear: clearResponseTimeout } =
		useTimeout(() => {
			const currentState = useRecordingStore.getState().state;
			if (currentState === "processing") {
				handleResponse(); // Reset to idle
			}
		}, 10000);

	// Keep store client in sync
	useEffect(() => {
		setClient(client ?? null);
	}, [client, setClient]);

	// Emit connection state changes to other windows (main window)
	useEffect(() => {
		const unsubscribe = useRecordingStore.subscribe((newState, prevState) => {
			if (newState.state !== prevState.state) {
				tauriAPI.emitConnectionState(newState.state as ConnectionState);
			}
		});
		// Emit initial state (get from store directly to avoid dependency issues)
		const initialState = useRecordingStore.getState().state;
		tauriAPI.emitConnectionState(initialState as ConnectionState);
		return unsubscribe;
	}, []);

	// ResizeObserver to auto-resize window to fit content
	useEffect(() => {
		if (!containerRef.current) return;

		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const { width, height } = entry.contentRect;
			tauriAPI.resizeOverlay(Math.ceil(width), Math.ceil(height));
		});

		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	// Handle start/stop recording from hotkeys
	const onStartRecording = useCallback(async () => {
		console.log("[Recording] Starting recording...");
		const success = await startRecording();
		console.log("[Recording] Start recording result:", success);
	}, [startRecording]);

	const onStopRecording = useCallback(() => {
		console.log("[Recording] Stopping recording...");
		if (stopRecording()) {
			console.log("[Recording] Stop recording success, waiting for response");
			startResponseTimeout();
		} else {
			console.log("[Recording] Stop recording failed");
		}
	}, [stopRecording, startResponseTimeout]);

	// Hotkey event listeners
	useEffect(() => {
		let unlistenStart: (() => void) | undefined;
		let unlistenStop: (() => void) | undefined;

		const setup = async () => {
			unlistenStart = await tauriAPI.onStartRecording(onStartRecording);
			unlistenStop = await tauriAPI.onStopRecording(onStopRecording);
		};

		setup();

		return () => {
			unlistenStart?.();
			unlistenStop?.();
		};
	}, [onStartRecording, onStopRecording]);

	// Connection and response event handlers
	useEffect(() => {
		if (!client) return;

		const onConnected = () => {
			console.log("[Pipecat] Connected to server");
			hasConnectedRef.current = true;
			handleConnected();

			// Sync cleanup prompt sections to server via REST API
			// This ensures the server uses the saved prompt from Tauri settings
			if (settings?.cleanup_prompt_sections) {
				setServerPromptSections.mutate(settings.cleanup_prompt_sections);
				console.log(
					"[Pipecat] Synced cleanup prompt sections to server via REST API",
				);
			}

			// Sync provider preferences to server
			if (settings?.stt_provider) {
				setServerSTTProvider.mutate(settings.stt_provider);
				console.log(
					"[Pipecat] Synced STT provider to server:",
					settings.stt_provider,
				);
			}
			if (settings?.llm_provider) {
				setServerLLMProvider.mutate(settings.llm_provider);
				console.log(
					"[Pipecat] Synced LLM provider to server:",
					settings.llm_provider,
				);
			}
		};

		const onDisconnected = () => {
			console.log("[Pipecat] Disconnected from server");

			// Check if we were recording/processing when disconnect happened
			const currentState = useRecordingStore.getState().state;
			if (currentState === "recording" || currentState === "processing") {
				console.warn("[Pipecat] Disconnected during recording/processing");
				try {
					client.enableMic(false);
				} catch {
					// Ignore errors when disabling mic
				}
			}

			handleDisconnected();

			// SmallWebRTC already tried to reconnect (3 attempts) and gave up
			// Keep retrying with the same client - must call disconnect() first to reset state
			if (hasConnectedRef.current && serverUrl) {
				console.log("[Pipecat] SmallWebRTC gave up, will retry in 3s...");
				setTimeout(async () => {
					try {
						// Must disconnect first to reset client state before reconnecting
						await client.disconnect();
						console.log("[Pipecat] Attempting to reconnect...");
						await client.connect({
							webrtcRequestParams: { endpoint: `${serverUrl}/api/offer` },
						});
					} catch (error: unknown) {
						// Connection failed - the next Disconnected event will trigger another retry
						console.error("[Pipecat] Reconnection attempt failed:", error);
					}
				}, 3000);
			}
		};

		const onServerMessage = async (message: unknown) => {
			console.log("[Pipecat] Server message:", message);
			if (isTranscriptMessage(message)) {
				clearResponseTimeout();
				console.log("[Pipecat] Typing text:", message.text);
				try {
					await typeTextMutation.mutateAsync(message.text);
					console.log("[Pipecat] Text typed successfully");
				} catch (error) {
					console.error("[Pipecat] Failed to type text:", error);
				}
				addHistoryEntry.mutate(message.text);
				handleResponse();
			} else if (isRecordingCompleteMessage(message)) {
				// Empty recording - no content to type, just reset state
				clearResponseTimeout();
				console.log("[Pipecat] Recording complete with no content");
				handleResponse();
			}
		};

		const onMicUpdated = (mic: MediaDeviceInfo) => {
			console.log("[Pipecat] Mic updated:", mic.label, mic.deviceId);
		};

		const onTrackStarted = (track: MediaStreamTrack) => {
			console.log("[Pipecat] Track started:", track.kind, track.label);
		};

		const onUserStartedSpeaking = () => {
			console.log("[Pipecat] User started speaking");
		};

		const onUserStoppedSpeaking = () => {
			console.log("[Pipecat] User stopped speaking");
		};

		const onError = (error: unknown) => {
			console.error("[Pipecat] Error:", error);
		};

		const onDeviceError = (error: unknown) => {
			console.error("[Pipecat] Device error:", error);
		};

		const onTransportStateChanged = (transportState: unknown) => {
			console.log("[Pipecat] Transport state changed:", transportState);
		};

		client.on(RTVIEvent.Connected, onConnected);
		client.on(RTVIEvent.Disconnected, onDisconnected);
		client.on(RTVIEvent.ServerMessage, onServerMessage);
		client.on(RTVIEvent.MicUpdated, onMicUpdated);
		client.on(RTVIEvent.TrackStarted, onTrackStarted);
		client.on(RTVIEvent.UserStartedSpeaking, onUserStartedSpeaking);
		client.on(RTVIEvent.UserStoppedSpeaking, onUserStoppedSpeaking);
		client.on(RTVIEvent.Error, onError);
		client.on(RTVIEvent.DeviceError, onDeviceError);
		client.on(RTVIEvent.TransportStateChanged, onTransportStateChanged);

		return () => {
			client.off(RTVIEvent.Connected, onConnected);
			client.off(RTVIEvent.Disconnected, onDisconnected);
			client.off(RTVIEvent.ServerMessage, onServerMessage);
			client.off(RTVIEvent.MicUpdated, onMicUpdated);
			client.off(RTVIEvent.TrackStarted, onTrackStarted);
			client.off(RTVIEvent.UserStartedSpeaking, onUserStartedSpeaking);
			client.off(RTVIEvent.UserStoppedSpeaking, onUserStoppedSpeaking);
			client.off(RTVIEvent.Error, onError);
			client.off(RTVIEvent.DeviceError, onDeviceError);
			client.off(RTVIEvent.TransportStateChanged, onTransportStateChanged);
		};
	}, [
		client,
		serverUrl,
		settings,
		handleConnected,
		handleDisconnected,
		handleResponse,
		typeTextMutation,
		addHistoryEntry,
		clearResponseTimeout,
		setServerPromptSections,
		setServerSTTProvider,
		setServerLLMProvider,
	]);

	// Click handler (toggle mode)
	const handleClick = useCallback(() => {
		if (state === "recording") {
			onStopRecording();
		} else if (state === "idle") {
			onStartRecording();
		}
	}, [state, onStartRecording, onStopRecording]);

	// Mouse move handler for drag detection
	const handleMouseMove = useCallback((event: MouseEvent) => {
		if (!mouseDownPositionRef.current || hasDragStartedRef.current) {
			return;
		}

		// Calculate distance moved from initial position
		const deltaX = event.clientX - mouseDownPositionRef.current.x;
		const deltaY = event.clientY - mouseDownPositionRef.current.y;
		const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

		// If movement exceeds threshold, start dragging
		const DRAG_THRESHOLD = 5;
		if (distance > DRAG_THRESHOLD) {
			hasDragStartedRef.current = true;
			isDraggingRef.current = true;
			tauriAPI.startDragging();
		}
	}, []);

	// Mouse up handler to cleanup listeners
	const handleMouseUp = useCallback(() => {
		// Clean up window event listeners
		window.removeEventListener("mousemove", handleMouseMove);
		window.removeEventListener("mouseup", handleMouseUp);

		// Reset drag state
		if (hasDragStartedRef.current) {
			isDraggingRef.current = false;
		}

		// Reset tracking refs
		mouseDownPositionRef.current = null;
		hasDragStartedRef.current = false;
	}, [handleMouseMove]);

	// Drag handler for unfocused window (data-tauri-drag-region doesn't work on unfocused windows)
	const handleMouseDown = useCallback(
		(event: React.MouseEvent) => {
			if (event.button !== 0) return; // Only handle left clicks

			// Record initial position
			mouseDownPositionRef.current = {
				x: event.clientX,
				y: event.clientY,
			};

			// Reset drag state
			isDraggingRef.current = false;
			hasDragStartedRef.current = false;

			// Attach window listeners to track movement
			window.addEventListener("mousemove", handleMouseMove);
			window.addEventListener("mouseup", handleMouseUp);
		},
		[handleMouseMove, handleMouseUp],
	);

	// Cleanup effect to remove window listeners on unmount
	useEffect(() => {
		return () => {
			window.removeEventListener("mousemove", handleMouseMove);
			window.removeEventListener("mouseup", handleMouseUp);
		};
	}, [handleMouseMove, handleMouseUp]);

	return (
		<div
			ref={containerRef}
			role="application"
			onMouseDown={handleMouseDown}
			style={{
				width: "fit-content",
				height: "fit-content",
				backgroundColor: "rgba(0, 0, 0, 0.9)",
				borderRadius: 12,
				padding: 4,
				cursor: "grab",
				userSelect: "none",
			}}
		>
			{state === "processing" ||
			state === "disconnected" ||
			state === "connecting" ? (
				<div
					style={{
						width: 48,
						height: 48,
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					}}
				>
					<Loader size="sm" color="white" />
				</div>
			) : (
				<UserAudioComponent
					onClick={handleClick}
					isMicEnabled={state === "recording"}
					noDevicePicker={true}
					noVisualizer={state !== "recording"}
					visualizerProps={{
						barColor: "#ffffff",
						backgroundColor: "#000000",
					}}
					classNames={{
						button: "bg-black text-white hover:bg-gray-900",
					}}
				/>
			)}
		</div>
	);
}

export default function OverlayApp() {
	const [client, setClient] = useState<PipecatClient | null>(null);
	const [devicesReady, setDevicesReady] = useState(false);
	const { data: settings } = useSettings();

	// Initial client creation on mount
	useEffect(() => {
		console.log("[OverlayApp] Initial client creation...");
		const transport = new SmallWebRTCTransport({
			iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
		});
		const pipecatClient = new PipecatClient({
			transport,
			enableMic: false,
			enableCam: false,
		});
		setClient(pipecatClient);

		pipecatClient
			.initDevices()
			.then(() => {
				console.log("[OverlayApp] Devices ready (initial)");
				setDevicesReady(true);
			})
			.catch((error: unknown) => {
				console.error("Failed to initialize devices:", error);
				setDevicesReady(true);
			});

		return () => {
			console.log("[OverlayApp] Unmounting, cleaning up client...");
			pipecatClient.disconnect().catch(() => {});
		};
	}, []);

	// Apply selected microphone when settings or client changes
	useEffect(() => {
		if (client && devicesReady && settings?.selected_mic_id) {
			client.updateMic(settings.selected_mic_id);
		}
	}, [client, devicesReady, settings?.selected_mic_id]);

	if (!client || !devicesReady) {
		return (
			<div
				className="flex items-center justify-center"
				style={{
					width: 48,
					height: 48,
					backgroundColor: "rgba(0, 0, 0, 0.9)",
					borderRadius: 12,
				}}
			>
				<Loader size="sm" color="white" />
			</div>
		);
	}

	return (
		<ThemeProvider>
			<PipecatClientProvider client={client}>
				<RecordingControl />
			</PipecatClientProvider>
		</ThemeProvider>
	);
}
