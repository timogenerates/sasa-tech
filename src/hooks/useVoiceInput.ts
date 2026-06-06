import { useEffect, useRef, useState } from "react";

type SR = {
  start: () => void;
  stop: () => void;
  abort: () => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type SRCtor = new () => SR;

function getCtor(): SRCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * Browser SpeechRecognition wrapper. `transcript` updates as the user speaks
 * (interim + final). Call `start()` to begin, `stop()` to commit.
 */
export function useVoiceInput(onFinal?: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const ref = useRef<SR | null>(null);

  useEffect(() => {
    const C = getCtor();
    setSupported(!!C);
    if (!C) return;
    const r = new C();
    r.continuous = true;
    r.interimResults = true;
    r.lang = "en-US";
    r.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
      }
      setTranscript(text);
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    ref.current = r;
    return () => { try { r.abort(); } catch { /* ignore */ } };
  }, []);

  function start() {
    if (!ref.current || listening) return;
    setTranscript("");
    try { ref.current.start(); setListening(true); } catch { /* ignore */ }
  }
  function stop() {
    if (!ref.current) return;
    try { ref.current.stop(); } catch { /* ignore */ }
    setListening(false);
    if (onFinal && transcript.trim()) onFinal(transcript.trim());
  }
  function toggle() { listening ? stop() : start(); }

  return { listening, transcript, supported, start, stop, toggle };
}