import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useListParties, useCreateParty, getListPartiesQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { Users, Gamepad2, Monitor, Plus, Lock, Globe } from "lucide-react";
import { PrestigeBadge } from "@/components/prestige-badge";

type CreatePartyForm = {
  name: string;
  game?: string;
  platform?: string;
  description?: string;
  maxSize: number;
  isPublic: boolean;
};

export default function Parties() {
  const { t } = useTranslation("parties");
  const [, setLocation] = useLocation();

  const createPartySchema = useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("validation.nameRequired")).max(100),
        game: z.string().optional(),
        platform: z.string().optional(),
        description: z.string().max(500).optional(),
        maxSize: z.coerce.number().min(2).max(100),
        isPublic: z.boolean().default(true)
      }),
    [t],
  );

  const { data: parties, isLoading } = useListParties({
    query: { refetchInterval: 10000, queryKey: getListPartiesQueryKey() }
  });
  
  const createParty = useCreateParty();
  const [open, setOpen] = useState(false);

  const form = useForm<CreatePartyForm>({
    resolver: zodResolver(createPartySchema),
    defaultValues: {
      name: "",
      game: "",
      platform: "",
      description: "",
      maxSize: 4,
      isPublic: true
    }
  });

  const onSubmit = (data: CreatePartyForm) => {
    createParty.mutate({ data }, {
      onSuccess: (party) => {
        setOpen(false);
        setLocation(`/party/${party.id}`);
      }
    });
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between border-b border-border pb-4">
        <div>
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase">{t("header.title")}</h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("header.subtitle")}</p>
        </div>
        
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="font-mono rounded-none">
              <Plus className="w-4 h-4 me-2" /> {t("header.formSquad")}
            </Button>
          </DialogTrigger>
          <DialogContent className="border-border bg-card rounded-none sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="font-mono uppercase tracking-widest text-primary border-b border-border pb-4">
                {t("dialog.title")}
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">{t("form.squadName")}</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" />
                      </FormControl>
                      <FormMessage className="text-xs" />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="game"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.targetGame")}</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.targetGamePlaceholder")} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="platform"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.platform")}</FormLabel>
                        <FormControl>
                          <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.platformPlaceholder")} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="maxSize"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.maxOperators")}</FormLabel>
                        <FormControl>
                          <Input type="number" {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="isPublic"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs uppercase">{t("form.visibility")}</FormLabel>
                        <Select onValueChange={(v) => field.onChange(v === "true")} value={field.value ? "true" : "false"}>
                          <FormControl>
                            <SelectTrigger className="font-mono bg-background border-border rounded-none">
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent className="bg-card border-border rounded-none font-mono">
                            <SelectItem value="true">{t("form.public")}</SelectItem>
                            <SelectItem value="false">{t("form.inviteOnly")}</SelectItem>
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-mono text-xs uppercase">{t("form.missionBriefing")}</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-mono bg-background border-border rounded-none focus-visible:ring-primary" placeholder={t("form.missionBriefingPlaceholder")} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="pt-4 flex justify-end">
                  <Button type="submit" className="font-mono rounded-none tracking-widest w-full" disabled={createParty.isPending}>
                    {t("dialog.execute")}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {isLoading ? (
          <div className="col-span-full py-12 text-center font-mono text-sm text-muted-foreground">{t("list.scanning")}</div>
        ) : parties?.length === 0 ? (
          <div className="col-span-full py-12 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
            {t("list.empty")}
          </div>
        ) : (
          parties?.map(party => (
            <Link key={party.id} href={`/party/${party.id}`} className="group bg-card border border-border flex flex-col hover:border-primary/50 transition-colors">
              <div className="p-4 border-b border-border bg-muted/20">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg truncate pe-4 group-hover:text-primary transition-colors">{party.name}</h3>
                  {party.isPublic ? <Globe className="w-4 h-4 text-muted-foreground shrink-0" /> : <Lock className="w-4 h-4 text-muted-foreground shrink-0" />}
                </div>
                <div className="flex gap-4 text-xs font-mono text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" /> {party.members.length}/{party.maxSize}
                  </span>
                  <span className="flex items-center gap-1">
                    <Monitor className="w-3 h-3" /> {party.platform || t("list.platformAny")}
                  </span>
                </div>
              </div>
              <div className="p-4 flex-1 flex flex-col justify-between gap-4">
                {party.game ? (
                  <div className="text-primary font-mono text-sm flex items-center gap-2">
                    <Gamepad2 className="w-4 h-4" /> {party.game}
                  </div>
                ) : (
                  <div className="text-muted-foreground font-mono text-xs italic">{t("list.noSpecificGame")}</div>
                )}

                <div className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground">
                  <div className="w-5 h-5 rounded-full bg-muted border border-border flex items-center justify-center overflow-hidden shrink-0">
                    {party.leader.avatarUrl
                      ? <img src={party.leader.avatarUrl} alt="" className="w-full h-full object-cover" />
                      : party.leader.displayName.charAt(0)}
                  </div>
                  <span className="truncate">{party.leader.displayName}</span>
                  <PrestigeBadge level={(party.leader as any).prestigeLevel ?? 0} size="xs" />
                </div>
                
                <div className="flex -space-x-2 rtl:space-x-reverse mt-auto">
                  {party.members.slice(0, 5).map(m => (
                    <div key={m.id} className="relative" title={m.displayName}>
                      <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center font-mono text-xs overflow-hidden z-10">
                        {m.avatarUrl ? <img src={m.avatarUrl} alt="" className="w-full h-full object-cover" /> : m.displayName.charAt(0)}
                      </div>
                      {((m as any).prestigeLevel ?? 0) > 0 && (
                        <span className="absolute -bottom-0.5 -end-0.5 z-20">
                          <PrestigeBadge level={(m as any).prestigeLevel} size="xs" />
                        </span>
                      )}
                    </div>
                  ))}
                  {party.members.length > 5 && (
                    <div className="w-8 h-8 rounded-full border-2 border-card bg-muted flex items-center justify-center font-mono text-[10px] z-0">
                      +{party.members.length - 5}
                    </div>
                  )}
                </div>
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
