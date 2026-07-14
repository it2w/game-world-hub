import { useEffect, useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { 
  useListConversations, 
  useGetMessages, 
  useSendMessage,
  useGetMe,
  useDeleteMessage,
  useHideConversation,
  getGetMessagesQueryKey,
  getListConversationsQueryKey,
  getGetMeQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Users, Shield, Trash2, Copy, X } from "lucide-react";
import { format } from "date-fns";
import { useVoice } from "@/voice/voice-context";

export default function Chat({ params }: { params: { conversationId?: string } }) {
  const { t } = useTranslation("chat");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: me } = useGetMe({ query: { queryKey: getGetMeQueryKey() } });
  const { data: conversations } = useListConversations({
    query: { refetchInterval: 10000, queryKey: getListConversationsQueryKey() }
  });
  
  const conversationId = params.conversationId ? parseInt(params.conversationId) : null;
  const activeConversation = conversations?.find(c => c.id === conversationId);
  
  const { data: messages } = useGetMessages(conversationId!, {
    query: { 
      enabled: !!conversationId,
      refetchInterval: 3000,
      queryKey: getGetMessagesQueryKey(conversationId!)
    }
  });

  const sendMessage = useSendMessage();
  const deleteMessage = useDeleteMessage();
  const hideConversation = useHideConversation();
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<number | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<number | null>(null);

  // Typing indicator state
  useVoice(); // Ensures WS typing events are dispatched
  const [typingUsers, setTypingUsers] = useState<Map<number, { displayName: string; timer: ReturnType<typeof setTimeout> }>>(new Map());
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Listen to WS typing events from the voice context WS
  // We do this by patching a global event bus
  useEffect(() => {
    if (!conversationId) return;
    const handleTyping = (e: CustomEvent) => {
      const { conversationId: cid, userId, displayName } = e.detail;
      if (cid !== conversationId || userId === me?.id) return;
      setTypingUsers(prev => {
        const next = new Map(prev);
        const existing = next.get(userId);
        if (existing) clearTimeout(existing.timer);
        const timer = setTimeout(() => {
          setTypingUsers(cur => {
            const m = new Map(cur);
            m.delete(userId);
            return m;
          });
        }, 3000);
        next.set(userId, { displayName, timer });
        return next;
      });
    };
    window.addEventListener("gwh:typing" as any, handleTyping as EventListener);
    return () => window.removeEventListener("gwh:typing" as any, handleTyping as EventListener);
  }, [conversationId, me?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const content = inputRef.current?.value.trim();
    if (!content || !conversationId) return;

    sendMessage.mutate(
      { conversationId, data: { content } },
      {
        onSuccess: () => {
          if (inputRef.current) inputRef.current.value = "";
          queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        }
      }
    );
  };

  // Send typing event via WS
  const sendTyping = useCallback(() => {
    if (!conversationId) return;
    window.dispatchEvent(new CustomEvent("gwh:send-typing", { detail: { conversationId } }));
  }, [conversationId]);

  const handleInputChange = () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping();
    typingTimeoutRef.current = setTimeout(() => {}, 2000);
  };

  const handleDeleteMessage = (msgId: number) => {
    if (!conversationId) return;
    deleteMessage.mutate({ conversationId, messageId: msgId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetMessagesQueryKey(conversationId) });
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
      }
    });
  };

  const handleCopyMessage = async (content: string, msgId: number) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId(null), 1500);
    } catch {}
  };

  const handleHideConversation = (convId: number) => {
    hideConversation.mutate({ conversationId: convId }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        setLocation("/chat");
      }
    });
  };

  const getConversationName = (conv: any) => {
    if (conv.name) return conv.name;
    if (conv.type === 'direct' && me) {
      const other = conv.participants.find((p: any) => p.id !== me.id);
      return other ? other.displayName : t("conversation.directMessage");
    }
    return t("conversation.groupChat");
  };

  // Listen for typing events and forward to WS
  useEffect(() => {
    const handleSendTyping = (e: CustomEvent) => {
      // Forward to WS (voice context WS handles it)
      // The voice WS is at gwh_token, so we pass the event forward
      window.dispatchEvent(new CustomEvent("gwh:ws-send", { detail: { type: "typing", conversationId: e.detail.conversationId } }));
    };
    window.addEventListener("gwh:send-typing" as any, handleSendTyping as EventListener);
    return () => window.removeEventListener("gwh:send-typing" as any, handleSendTyping as EventListener);
  }, []);

  const typingNames = Array.from(typingUsers.values()).map(u => u.displayName);

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* Sidebar */}
      <div className="w-80 border-e border-border bg-card flex flex-col shrink-0">
        <div className="p-4 border-b border-border">
          <h2 className="font-mono text-sm uppercase font-bold tracking-widest text-muted-foreground">{t("sidebar.title")}</h2>
        </div>
        <div className="flex-1 overflow-auto divide-y divide-border">
          {conversations?.map(conv => {
            const isActive = conv.id === conversationId;
            const name = getConversationName(conv);
            return (
              <div key={conv.id} className={`group relative flex ${isActive ? 'bg-primary/10 border-s-2 border-s-primary' : 'hover:bg-muted/50 border-s-2 border-s-transparent'}`}>
                <button
                  onClick={() => setLocation(`/chat/${conv.id}`)}
                  className="flex-1 p-4 text-start flex gap-3 transition-colors min-w-0"
                >
                  <div className={`w-10 h-10 shrink-0 flex items-center justify-center border ${conv.type === 'party' ? 'border-primary text-primary bg-primary/5' : 'border-border bg-muted'} font-mono`}>
                    {conv.type === 'party' ? <Shield className="w-5 h-5" /> : name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <span className="font-bold text-sm truncate">{name}</span>
                      {conv.lastMessage && (
                        <span className="text-[10px] text-muted-foreground font-mono shrink-0 ms-2">
                          {format(new Date(conv.lastMessage.createdAt), "HH:mm")}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate font-mono">
                      {conv.lastMessage ? (
                        <>
                          <span className="text-foreground">{conv.lastMessage.sender.id === me?.id ? t("sidebar.you") : conv.lastMessage.sender.displayName}: </span>
                          {conv.lastMessage.content}
                        </>
                      ) : t("sidebar.noMessages")}
                    </div>
                  </div>
                  {conv.unreadCount ? (
                    <div className="shrink-0 self-center w-5 h-5 bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">
                      {conv.unreadCount}
                    </div>
                  ) : null}
                </button>
                {/* Hide conversation button */}
                {conv.type === 'direct' && (
                  <button
                    onClick={(e) => { e.stopPropagation(); handleHideConversation(conv.id); }}
                    className="opacity-0 group-hover:opacity-100 self-center me-2 p-1.5 text-muted-foreground hover:text-destructive transition-opacity"
                    title={t("sidebar.hideConversation")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col bg-background relative">
        {conversationId ? (
          <>
            <div className="h-16 border-b border-border bg-card/50 px-6 flex items-center justify-between shrink-0 backdrop-blur">
              <div className="flex items-center gap-3">
                <div className="font-bold">{activeConversation ? getConversationName(activeConversation) : t("conversation.loading")}</div>
                {activeConversation?.type === 'party' && (
                  <div className="px-2 py-0.5 border border-primary/30 bg-primary/10 text-primary text-[10px] font-mono uppercase">
                    {t("conversation.partyComms")}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm font-mono text-muted-foreground">
                <Users className="w-4 h-4" />
                {activeConversation?.participants.length || 0}
              </div>
            </div>

            <div className="flex-1 overflow-auto p-6 space-y-6">
              {messages?.map((msg, i) => {
                const isMe = msg.sender.id === me?.id;
                const showHeader = i === 0 || messages[i - 1].sender.id !== msg.sender.id;
                const isHovered = hoveredMsgId === msg.id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                    onMouseEnter={() => setHoveredMsgId(msg.id)}
                    onMouseLeave={() => setHoveredMsgId(null)}
                  >
                    {showHeader && (
                      <div className="text-xs font-mono text-muted-foreground mb-1 ms-1 me-1 flex items-center gap-2">
                        <span>{msg.sender.displayName}</span>
                        <span className="text-[10px] opacity-50">{format(new Date(msg.createdAt), "HH:mm")}</span>
                      </div>
                    )}
                    <div className={`flex items-center gap-1.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                      <div className={`px-4 py-2 max-w-[75%] ${
                        isMe 
                          ? 'bg-primary text-primary-foreground font-medium' 
                          : 'bg-card border border-border text-foreground'
                      }`}>
                        {msg.content}
                      </div>
                      {/* Hover action buttons */}
                      {isHovered && (
                        <div className={`flex items-center gap-0.5 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                          <button
                            onClick={() => handleCopyMessage(msg.content, msg.id)}
                            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            title={t("msg.copy")}
                          >
                            {copiedMsgId === msg.id ? (
                              <span className="text-[10px] font-mono text-primary">✓</span>
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          {isMe && (
                            <button
                              onClick={() => handleDeleteMessage(msg.id)}
                              className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                              title={t("msg.delete")}
                              disabled={deleteMessage.isPending}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
              {/* Typing indicator */}
              {typingNames.length > 0 && (
                <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground italic">
                  <span className="flex gap-0.5">
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                    <span className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                  </span>
                  {typingNames.length === 1
                    ? t("typing.one", { name: typingNames[0] })
                    : t("typing.multiple", { count: typingNames.length })}
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="p-4 border-t border-border bg-card shrink-0">
              <form onSubmit={handleSend} className="flex gap-2">
                <Input
                  ref={inputRef}
                  placeholder={t("input.placeholder")}
                  className="flex-1 font-mono rounded-none bg-background border-border h-12 focus-visible:ring-primary"
                  disabled={sendMessage.isPending}
                  onChange={handleInputChange}
                />
                <Button type="submit" className="w-12 h-12 rounded-none shrink-0" disabled={sendMessage.isPending}>
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center flex-col text-muted-foreground">
            <div className="w-16 h-16 border-2 border-dashed border-border flex items-center justify-center mb-4">
              <Send className="w-8 h-8 opacity-50" />
            </div>
            <div className="font-mono text-sm tracking-widest uppercase">{t("empty.selectChannel")}</div>
          </div>
        )}
      </div>
    </div>
  );
}
