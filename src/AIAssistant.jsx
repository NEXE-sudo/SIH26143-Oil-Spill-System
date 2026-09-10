import React, { useState, useRef, useEffect } from "react";

const INITIAL_MESSAGES = [
  {
    sender: "assistant",
    text: "Welcome to NTRO Maritime Intelligence Console. I am your automated AI operational assistant. How can I assist your investigation today?",
  },
];

const QUICK_PROMPTS = [
  "How do I lodge a spill investigation?",
  "What SAR preprocessing steps are used?",
  "How is the oil drift trajectory calculated?",
  "How do I export investigation reports?",
];

// Fallback dictionary for guaranteed instant responses during high traffic/load
const getLocalFallbackReply = (query) => {
  const lower = query.toLowerCase();
  if (lower.includes("lodge") || lower.includes("investigation")) {
    return "To lodge an investigation: Click 'All' under Reports, select a detected spill coordinate (e.g., INV-2026-0003), and click 'Lodge Investigation' to pass data to enforcement teams.";
  } else if (lower.includes("sar") || lower.includes("preprocessing")) {
    return "Our SAR pipeline applies Non-Local Means (NLM) denoising, speckle filtering, and backscatter intensity normalization to isolate slick dark spots from ocean background clutter.";
  } else if (lower.includes("drift") || lower.includes("trajectory")) {
    return "The drift model combines sea surface current vectors with wind forcing parameters to simulate 24-hour forward/backward hindcast trajectories for ocean spill dispersion.";
  } else if (lower.includes("export") || lower.includes("pdf") || lower.includes("report")) {
    return "You can export full investigation dossiers as GeoJSON or PDF by clicking the 'Export' button on the top right of any active report.";
  } else if (lower.includes("satellite") || lower.includes("sensor") || lower.includes("data")) {
    return "The console ingests Sentinel-1 C-band SAR data and processed RADARSAT scenes for all-weather, day/night marine monitoring.";
  } else if (lower.includes("alert") || lower.includes("notification")) {
    return "Automated alerts are triggered whenever the SAR backscatter coefficient drops below the oil threshold over high-traffic shipping lanes.";
  }
  return "I can help guide you through the NTRO investigation workflow. Select an anomaly or lodge a new report to analyze satellite data.";
};

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = async (textToSend) => {
    const query = textToSend || input;
    if (!query.trim()) return;

    // Add user message
    const newMessages = [...messages, { sender: "user", text: query }];
    setMessages(newMessages);
    if (!textToSend) setInput("");
    setIsTyping(true);

    let botReply = "";

    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      // Using gemini-3.7-flash (stable production workhorse model)
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `You are the NTRO Maritime Oil Spill Intelligence Console Copilot. Provide short, concise, professional answers about SAR satellite imagery, AIS tracking, and drift models. Question: ${query}`
                  }
                ]
              }
            ]
          })
        }
      );

      const data = await response.json();
      
      if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        botReply = data.candidates[0].content.parts[0].text;
      } else {
        // If Google throttles or errors out, seamlessly use our offline expert fallback
        botReply = getLocalFallbackReply(query);
      }
    } catch (error) {
      // If network fails entirely, seamlessly use our offline expert fallback
      botReply = getLocalFallbackReply(query);
    }

    setMessages((prev) => [...prev, { sender: "assistant", text: botReply }]);
    setIsTyping(false);
  };

  return (
    <div className="ai-assistant-wrapper">
      {/* Floating Toggle Button */}
      <button
        className="ai-widget-trigger"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle AI Assistant"
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M12 2a10 10 0 0 1 10 10c0 5.523-4.477 10-10 10S2 17.523 2 12A10 10 0 0 1 12 2z" />
          <path d="M8 10h8M8 14h5" strokeLinecap="round" />
        </svg>
        <span>AI Assistant</span>
      </button>

      {/* Chat Window */}
      {isOpen && (
        <div className="ai-chat-window">
          <div className="ai-chat-header">
            <div className="ai-header-title">
              <span className="ai-status-indicator" />
              NTRO Console Copilot
            </div>
            <button
              className="ai-close-btn"
              onClick={() => setIsOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="ai-chat-body">
            {messages.map((msg, idx) => (
              <div key={idx} className={`ai-message ${msg.sender}`}>
                <div className="ai-bubble">{msg.text}</div>
              </div>
            ))}

            {isTyping && (
              <div className="ai-message assistant">
                <div className="ai-bubble ai-typing">
                  Analyzing telemetry...
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Quick Action Chips */}
          <div className="ai-quick-chips">
            {QUICK_PROMPTS.map((prompt, idx) => (
              <button
                key={idx}
                className="ai-chip"
                onClick={() => handleSend(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Input Form */}
          <form
            className="ai-chat-footer"
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
          >
            <input
              type="text"
              placeholder="Ask NTRO Copilot..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button type="submit" className="ai-send-btn">
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  );
}