import { useEffect, useRef, useState } from "react";
import "./App.css";
import {
  Transcript,
  UltravoxSession,
  UltravoxSessionStatus,
} from "ultravox-client";
import { instructionsPrompt, systemPrompt } from "./template";
import { checkDateAvailability } from "./date-checker";

function cleanField(value: string | boolean) {
  if (value === "true" || value === "yes") {
    return true;
  } else if (value === "false" || value === "no") {
    return false;
  }
  return value;
}

function useUltravoxSession(joinURL: string | undefined, muted: boolean) {
  const [session, setSession] = useState<UltravoxSession | null>(null);
  const [status, setStatus] = useState<UltravoxSessionStatus>(
    UltravoxSessionStatus.IDLE
  );
  const [transcript, setTranscript] = useState<Transcript[]>([]);

  useEffect(() => {
    if (!joinURL) {
      return;
    }

    const session = new UltravoxSession();
    setSession(session);
    setTranscript([]);

    // Expose session status changes
    const handleStatusChange = () => {
      setStatus(session.status);
    };
    session.addEventListener("status", handleStatusChange);

    // Expose transcripts
    const handleTranscriptChange = () => {
      setTranscript(session.transcripts.slice());
    };
    session.addEventListener("transcripts", handleTranscriptChange);
    session.joinCall(joinURL, "uv_console");

    return () => {
      session.removeEventListener("status", handleStatusChange);
      session.removeEventListener("transcript", handleTranscriptChange);
      setStatus(UltravoxSessionStatus.IDLE);
      setSession(null);
      session.leaveCall();
    };
  }, [joinURL]);

  useEffect(() => {
    if (
      session &&
      status !== UltravoxSessionStatus.DISCONNECTED &&
      status !== UltravoxSessionStatus.CONNECTING
    ) {
      if (muted) {
        session.muteMic();
      } else {
        session.unmuteMic();
      }
    }
  }, [session, status, muted]);

  return { session, status, transcript };
}

const details = {
  prospect_business_title: "CEO",
  prospect_company_name: "Acme Corp",
  prospect_name: "John Doe",
  customer_name: "Acme Corp",
};

function JoinURLInput({ onSubmit }: { onSubmit: (joinURL: string) => void }) {
  const [joinURL, setJoinURL] = useState<string | undefined>(undefined);

  return (
    <>
      <input
        type="text"
        placeholder="Enter join URL"
        value={joinURL}
        onChange={(e) => setJoinURL(e.target.value)}
      />
      <button onClick={() => joinURL && onSubmit(joinURL)}>Submit</button>
      <button
        onClick={async () => {
          const response = await fetch("https://api.ultravox.ai/api/calls", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Unsafe-API-Key": import.meta.env.VITE_ULTRAVOX_API_KEY,
            },
            body: JSON.stringify({
              systemPrompt: systemPrompt({
                details,
              }),
              voice: "Mark",
              firstSpeakerSettings: {
                user: {},
              },
              // initialOutputMedium: "MESSAGE_MEDIUM_TEXT",
              initialMessages: [
                {
                  role: "MESSAGE_ROLE_USER",
                  text: `<instruction>${instructionsPrompt({
                    details,
                    state: {},
                  })}</instruction>`,
                },
              ],
              selectedTools: [
                {
                  toolName: "hangUp",
                },
                {
                  temporaryTool: {
                    modelToolName: "updateObjective",
                    description: "Updates an objective status",
                    client: {},
                    dynamicParameters: [
                      {
                        name: "name",
                        location: "PARAMETER_LOCATION_BODY",
                        schema: {
                          type: "string",
                          description:
                            "The objective to update. Must match a specific objective name.",
                        },
                      },
                      {
                        name: "result",
                        location: "PARAMETER_LOCATION_BODY",
                        schema: {
                          anyOf: [{ type: "boolean" }, { type: "string" }],
                          description: "The objective result.",
                        },
                      },
                    ],
                    defaultReaction: "AGENT_REACTION_SPEAKS_ONCE",
                  },
                },
                {
                  temporaryTool: {
                    modelToolName: "checkDesiredDate",
                    description:
                      "Check if the desired date is available for a demo.",
                    client: {},
                    dynamicParameters: [
                      {
                        name: "date",
                        location: "PARAMETER_LOCATION_BODY",
                        schema: {
                          type: "string",
                          format: "date-time",
                          description: "The ISO 8601 datetime to check.",
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          });

          if (response.status >= 400) {
            alert("Failed to create call: " + (await response.text()));
            return;
          }

          const { joinUrl } = await response.json();
          setJoinURL(joinUrl);
          onSubmit(joinUrl);
        }}
      >
        Start Call
      </button>
    </>
  );
}

function TextInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState<string | undefined>(undefined);

  const clearAndSubmit = () => {
    if (text) {
      onSubmit(text);
      setText("");
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        bottom: "2em",
        left: "2em",
        right: "2em",
        display: "flex",
      }}
    >
      <input
        type="text"
        style={{ flex: 1, fontSize: "1.5em" }}
        placeholder="Enter text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && text && clearAndSubmit()}
      />
      <button onClick={() => text && clearAndSubmit()}>Submit</button>
    </div>
  );
}

function App() {
  const [joinURL, setJoinURL] = useState<string | undefined>(undefined);
  const { session, status, transcript } = useUltravoxSession(joinURL, false);
  const callObjectivesRef = useRef<Record<string, unknown>>({});
  const [objectives, setObjectives] = useState<Record<string, unknown>>({});
  const instructionsRef = useRef<string>("");
  const [activeInstructions, setActiveInstructions] = useState<string>("");

  useEffect(() => {
    callObjectivesRef.current = {};
    setObjectives({});
    setActiveInstructions("");
    instructionsRef.current = "";
  }, [joinURL]);

  useEffect(() => {
    session?.registerToolImplementation(
      "updateObjective",
      (params: Record<string, unknown>) => {
        const oldObjectives = callObjectivesRef.current;
        const newObjectives = {
          ...oldObjectives,
          [params.name]: cleanField(params.result),
        };
        setObjectives(newObjectives);
        callObjectivesRef.current = newObjectives;

        const newInstructions = instructionsPrompt({
          details,
          state: newObjectives,
        });
        if (newInstructions !== instructionsRef.current) {
          instructionsRef.current = newInstructions;
          setActiveInstructions(newInstructions);
          return (
            JSON.stringify(newObjectives) +
            "\n\n<instruction>" +
            newInstructions +
            "</instruction>"
          );
        } else {
          return JSON.stringify(newObjectives);
        }
      }
    );

    session?.registerToolImplementation(
      "checkDesiredDate",
      (params: Record<string, unknown>) => {
        return JSON.stringify(checkDateAvailability(params.date));
      }
    );
  }, [session]);

  return (
    <>
      <div>
        {!session ||
        session.status == UltravoxSessionStatus.IDLE ||
        session.status == UltravoxSessionStatus.DISCONNECTED ? (
          <JoinURLInput onSubmit={setJoinURL} />
        ) : (
          <>
            <TextInput
              onSubmit={(text) =>
                session &&
                session.sendData({
                  type: "input_text_message",
                  text,
                })
              }
            />
            <button
              onClick={() =>
                session &&
                session.sendData({
                  type: "input_text_message",
                  text: "<instruction>This conversation has been going on for too long. Wrap it up.</instruction>",
                  defer_response: true,
                })
              }
            >
              Wrap it Up
            </button>
            <button onClick={() => setJoinURL(undefined)}>End Call</button>
          </>
        )}
      </div>
      <div>{status}</div>
      <div
        style={{
          position: "fixed",
          left: "2em",
          top: "2em",
          maxWidth: "400px",
          textAlign: "left",
          background: "rgba(255, 255, 255, 0.8)",
          padding: "1em",
        }}
      >
        <h3>Objectives</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(objectives, null, 2)}
        </pre>
        <h3>Instructions</h3>
        <pre style={{ whiteSpace: "pre-wrap" }}>{activeInstructions}</pre>
      </div>
      <div style={{ marginBottom: "4em" }}>
        {transcript.map((t, i) => (
          <div
            key={i}
            style={{
              whiteSpace: "pre-wrap",
              width: "600px",
              margin: "10px",
              textAlign: "left",
            }}
          >
            <strong>{t.speaker}</strong>: {t.text}
          </div>
        ))}
      </div>
    </>
  );
}

export default App;
