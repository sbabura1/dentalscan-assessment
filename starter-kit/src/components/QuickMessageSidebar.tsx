"use client";

import { RefreshCw, X } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface QuickMessageSidebarProps {
  scanId: string;
  currentUserId: string;
  currentUserName: string;
  isOpen: boolean;
  onClose: () => void;
}

interface MessageWithSender {
  id: string;
  content: string;
  sentAt: string;
  isPending?: boolean;
  sender: { id: string; name: string };
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export default function QuickMessageSidebar({
  scanId,
  currentUserId,
  currentUserName,
  isOpen,
  onClose,
}: QuickMessageSidebarProps) {
  const [messages, setMessages] = useState<MessageWithSender[]>([]);
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isCancelled = false;

    async function fetchMessages(showLoading: boolean) {
      if (showLoading) {
        setIsLoading(true);
      }

      try {
        const response = await fetch(`/api/threads/${scanId}/messages`);

        if (response.status === 404) {
          if (!isCancelled) {
            setMessages((prev) => prev.filter((message) => message.isPending));
          }
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch messages");
        }

        const data = await response.json();

        if (!isCancelled) {
          setMessages((prev) => {
            const pendingMessages = prev.filter((message) => message.isPending);
            const fetchedMessages = (data.messages ?? []) as MessageWithSender[];
            const fetchedIds = new Set(fetchedMessages.map((message) => message.id));

            return [
              ...fetchedMessages,
              ...pendingMessages.filter((message) => !fetchedIds.has(message.id)),
            ];
          });
        }
      } catch (error) {
        console.error("Failed to load messages", error);
      } finally {
        if (!isCancelled && showLoading) {
          setIsLoading(false);
        }
      }
    }

    void fetchMessages(true);

    const intervalId = window.setInterval(() => {
      void fetchMessages(false);
    }, 5000);

    return () => {
      isCancelled = true;
      window.clearInterval(intervalId);
    };
  }, [scanId]);

  const sortedMessages = useMemo(
    () =>
      [...messages].sort(
        (left, right) =>
          new Date(left.sentAt).getTime() - new Date(right.sentAt).getTime()
      ),
    [messages]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sortedMessages]);

  async function handleSend() {
    const trimmedInput = input.trim();

    if (!trimmedInput || isSending) {
      return;
    }

    const optimisticId = crypto.randomUUID();
    const optimisticMessage: MessageWithSender = {
      id: optimisticId,
      content: trimmedInput,
      sentAt: new Date().toISOString(),
      isPending: true,
      sender: {
        id: currentUserId,
        name: currentUserName,
      },
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setInput("");
    setIsSending(true);
    setSendError(null);

    try {
      const response = await fetch(`/api/threads/${scanId}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: trimmedInput,
          senderId: currentUserId,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      const createdMessage = (await response.json()) as MessageWithSender;

      setMessages((prev) =>
        prev.map((message) =>
          message.id === optimisticId ? createdMessage : message
        )
      );
    } catch (error) {
      console.error("Failed to send message", error);
      setMessages((prev) =>
        prev.filter((message) => message.id !== optimisticId)
      );
      setInput(trimmedInput);
      setSendError("Failed to send. Try again.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {isOpen && (
        <button
          aria-label="Close messages"
          className="fixed inset-0 bg-black/40 sm:hidden"
          onClick={onClose}
          type="button"
        />
      )}

      <aside
        className={`fixed top-0 right-0 z-50 flex h-full w-full flex-col border-l border-zinc-800 bg-white text-zinc-900 shadow-2xl transition-transform duration-300 ease-in-out sm:w-[360px] ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Messages</h2>
            <p className="text-xs text-zinc-500">Patient and clinic updates</p>
          </div>

          <button
            className="rounded-full p-2 text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((line) => (
                <div
                  key={line}
                  className="h-14 animate-pulse rounded-2xl bg-gray-200"
                />
              ))}
            </div>
          ) : sortedMessages.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
              Start the conversation with your clinic.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedMessages.map((message) => {
                const isOwnMessage = message.sender.id === currentUserId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${
                      isOwnMessage ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[85%] ${
                        message.isPending ? "opacity-60" : "opacity-100"
                      }`}
                    >
                      {!isOwnMessage && (
                        <p className="mb-1 text-xs font-medium text-zinc-500">
                          {message.sender.name}
                        </p>
                      )}

                      <div
                        className={`rounded-2xl px-3 py-2 text-sm ${
                          isOwnMessage
                            ? "bg-blue-500 text-white"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {message.content}
                      </div>

                      <p
                        className={`mt-1 text-xs text-zinc-400 ${
                          isOwnMessage ? "text-right" : "text-left"
                        }`}
                      >
                        {formatRelativeTime(message.sentAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="border-t border-zinc-200 bg-white p-4">
          <label className="mb-2 block text-xs font-medium uppercase tracking-[0.2em] text-zinc-400">
            Quick message
          </label>
          <textarea
            className="min-h-28 w-full rounded-2xl border border-zinc-200 px-4 py-3 text-sm text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-blue-500"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.ctrlKey && event.key === "Enter") {
                event.preventDefault();
                void handleSend();
              }
            }}
            placeholder="Send a note to your clinic..."
            value={input}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-red-500">{sendError ?? "Ctrl+Enter to send"}</p>

            <button
              className="inline-flex items-center gap-2 rounded-full bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:bg-blue-300"
              disabled={isSending || !input.trim()}
              onClick={() => void handleSend()}
              type="button"
            >
              {isSending && <RefreshCw className="animate-spin" size={14} />}
              Send
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
