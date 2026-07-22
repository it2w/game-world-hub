import { useState, useRef, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { Plus, Trash2, X, BarChart2, Loader2 } from "lucide-react";

interface PollComposerProps {
  conversationId: number;
  onClose: () => void;
  onCreated: (messageId: number) => void;
}

export function PollComposer({ conversationId, onClose, onCreated }: PollComposerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [closesAt, setClosesAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  const addOption = () => {
    if (options.length < 5) setOptions((o) => [...o, ""]);
  };

  const removeOption = (i: number) => {
    if (options.length > 2) setOptions((o) => o.filter((_, idx) => idx !== i));
  };

  const updateOption = (i: number, val: string) => {
    setOptions((o) => o.map((v, idx) => (idx === i ? val : v)));
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const trimmedQ = question.trim();
    const trimmedOpts = options.map((o) => o.trim()).filter(Boolean);
    if (!trimmedQ) { setError("Question is required"); return; }
    if (trimmedOpts.length < 2) { setError("At least 2 options are required"); return; }

    setCreating(true);
    try {
      const result = await customFetch<{ messageId: number }>(
        `/api/conversations/${conversationId}/polls`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question: trimmedQ,
            options: trimmedOpts,
            closesAt: closesAt || undefined,
          }),
        },
      );
      onCreated(result.messageId);
      onClose();
    } catch (err: any) {
      setError(err?.data?.error ?? "Failed to create poll");
    }
    setCreating(false);
  };

  return (
    <div
      ref={ref}
      className="absolute bottom-full mb-2 start-0 z-50 w-80 bg-card border border-border rounded-xl shadow-2xl overflow-hidden"
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-card">
        <BarChart2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Create Poll</span>
        <button onClick={onClose} className="ms-auto p-1 hover:bg-muted rounded text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      <form onSubmit={handleCreate} className="p-4 space-y-3">
        {/* Question */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block mb-1">
            Question
          </label>
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="What do you want to ask?"
            maxLength={200}
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
            autoFocus
          />
        </div>

        {/* Options */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block mb-1">
            Options ({options.length}/5)
          </label>
          <div className="space-y-1.5">
            {options.map((opt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={opt}
                  onChange={(e) => updateOption(i, e.target.value)}
                  placeholder={`Option ${i + 1}`}
                  maxLength={80}
                  className="flex-1 bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary/50 transition-colors placeholder:text-muted-foreground"
                />
                {options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(i)}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
            {options.length < 5 && (
              <button
                type="button"
                onClick={addOption}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add option
              </button>
            )}
          </div>
        </div>

        {/* Expiry */}
        <div>
          <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono block mb-1">
            Close at (optional)
          </label>
          <input
            type="datetime-local"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
            className="w-full bg-muted/40 border border-border rounded-lg px-3 py-1.5 text-sm outline-none focus:border-primary/50 transition-colors text-foreground"
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={creating}
          className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground rounded-lg py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {creating ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating…</> : "Create Poll"}
        </button>
      </form>
    </div>
  );
}
