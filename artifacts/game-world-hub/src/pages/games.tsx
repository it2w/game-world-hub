import { useState } from "react";
import { useTranslation } from "react-i18next";
import { 
  useListAllGames, 
  useGetMe, 
  useGetUserGames, 
  useAddUserGame, 
  useRemoveUserGame,
  useAddGame,
  getGetUserGamesQueryKey,
  getListAllGamesQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Search, Plus, Trash2, Library } from "lucide-react";

const addGameSchema = z.object({
  name: z.string().min(1).max(200),
  coverUrl: z.string().url().optional().or(z.literal("")),
  genre: z.string().optional(),
});

export default function Games() {
  const { t } = useTranslation("games");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  
  const { data: me } = useGetMe();
  const { data: masterGames } = useListAllGames();
  const { data: myGames } = useGetUserGames(me?.id || 0, {
    query: { enabled: !!me?.id, queryKey: getGetUserGamesQueryKey(me?.id || 0) }
  });

  const addUserGame = useAddUserGame();
  const removeUserGame = useRemoveUserGame();
  const createMasterGame = useAddGame();

  const form = useForm<z.infer<typeof addGameSchema>>({
    resolver: zodResolver(addGameSchema),
    defaultValues: { name: "", coverUrl: "", genre: "" }
  });

  const handleAddMasterGame = (data: z.infer<typeof addGameSchema>) => {
    createMasterGame.mutate({ data }, {
      onSuccess: () => {
        setOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListAllGamesQueryKey() });
      }
    });
  };

  const handleAddToLibrary = (gameId: number) => {
    if (!me) return;
    addUserGame.mutate({ userId: me.id, data: { gameId } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserGamesQueryKey(me.id) })
    });
  };

  const handleRemoveFromLibrary = (gameId: number) => {
    if (!me) return;
    removeUserGame.mutate({ userId: me.id, gameId }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetUserGamesQueryKey(me.id) })
    });
  };

  const myGameIds = new Set(myGames?.map(ug => ug.game.id) || []);
  
  const filteredMasterList = masterGames?.filter(g => 
    g.name.toLowerCase().includes(search.toLowerCase()) && !myGameIds.has(g.id)
  ) || [];

  return (
    <div className="p-6 max-w-6xl mx-auto flex flex-col md:flex-row gap-8">
      {/* My Library */}
      <div className="flex-1 space-y-6">
        <div className="border-b border-border pb-4">
          <h1 className="text-3xl font-bold font-mono tracking-tighter uppercase flex items-center gap-3">
            <Library className="w-8 h-8 text-primary" /> {t("library.title")}
          </h1>
          <p className="text-muted-foreground font-mono text-sm mt-1">{t("library.indexed", { count: myGames?.length || 0 })}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {myGames?.length === 0 ? (
            <div className="col-span-full py-12 text-center border border-dashed border-border font-mono text-sm text-muted-foreground">
              {t("library.empty")}
            </div>
          ) : (
            myGames?.map(ug => (
              <div key={ug.id} className="bg-card border border-border group relative overflow-hidden aspect-[3/4]">
                {ug.game.coverUrl ? (
                  <img src={ug.game.coverUrl} alt={ug.game.name} className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted font-mono text-4xl text-muted-foreground/30 font-bold p-4 text-center">
                    {ug.game.name.substring(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent p-4 flex flex-col justify-end">
                  <h3 className="font-bold text-sm leading-tight drop-shadow-md">{ug.game.name}</h3>
                  {ug.game.genre && <span className="text-[10px] font-mono text-primary mt-1 drop-shadow-md">{ug.game.genre}</span>}
                </div>
                
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button size="icon" variant="destructive" className="h-8 w-8 rounded-none" onClick={() => handleRemoveFromLibrary(ug.game.id)} disabled={removeUserGame.isPending}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Global Database */}
      <div className="w-full md:w-80 shrink-0 space-y-4">
        <div className="bg-card border border-border p-4">
          <h2 className="font-mono text-sm uppercase tracking-widest text-primary mb-4">{t("database.title")}</h2>
          
          <div className="relative mb-4">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input 
              placeholder={t("database.searchPlaceholder")}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="font-mono pl-9 rounded-none border-border bg-background h-10"
            />
          </div>

          <div className="space-y-2 max-h-[600px] overflow-auto pr-2">
            {filteredMasterList.length === 0 ? (
              <div className="text-center py-4 text-xs font-mono text-muted-foreground">{t("database.noResults")}</div>
            ) : (
              filteredMasterList.map(game => (
                <div key={game.id} className="p-2 border border-border flex items-center justify-between hover:border-primary/50 transition-colors bg-background">
                  <div className="min-w-0 pr-2">
                    <div className="text-sm font-bold truncate">{game.name}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{game.genre || t("database.unknownGenre")}</div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 rounded-none px-2 font-mono text-[10px] border-primary/30 text-primary hover:bg-primary/10" onClick={() => handleAddToLibrary(game.id)} disabled={addUserGame.isPending}>
                    <Plus className="w-3 h-3" /> {t("database.addToLibrary")}
                  </Button>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-border">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full rounded-none font-mono text-xs border-dashed">
                  {t("database.addButton")}
                </Button>
              </DialogTrigger>
              <DialogContent className="border-border bg-card rounded-none">
                <DialogHeader>
                  <DialogTitle className="font-mono uppercase tracking-widest text-primary">{t("dialog.title")}</DialogTitle>
                </DialogHeader>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(handleAddMasterGame)} className="space-y-4 pt-4">
                    <FormField control={form.control} name="name" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs">{t("dialog.fieldTitle")}</FormLabel>
                        <FormControl><Input {...field} className="font-mono rounded-none border-border" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="genre" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs">{t("dialog.fieldGenre")}</FormLabel>
                        <FormControl><Input {...field} className="font-mono rounded-none border-border" /></FormControl>
                      </FormItem>
                    )} />
                    <FormField control={form.control} name="coverUrl" render={({ field }) => (
                      <FormItem>
                        <FormLabel className="font-mono text-xs">{t("dialog.fieldCover")}</FormLabel>
                        <FormControl><Input {...field} className="font-mono rounded-none border-border" /></FormControl>
                      </FormItem>
                    )} />
                    <Button type="submit" className="w-full font-mono rounded-none" disabled={createMasterGame.isPending}>{t("dialog.submit")}</Button>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}
