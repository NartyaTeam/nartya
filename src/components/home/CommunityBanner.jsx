import { ArrowUpRight } from "lucide-react";
import { openDiscord } from "@/lib/community";
import DiscordIcon from "@/components/icons/DiscordIcon";

export default function CommunityBanner() {
  return (
    <section className="px-4 sm:px-8">
      <div className="group relative overflow-hidden rounded-lg border border-border bg-surface">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(110%_130%_at_0%_0%,rgb(88_101_242/0.16),transparent_58%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-4 -top-8 select-none font-display text-[8rem] leading-none text-white/[0.04] transition-transform duration-700 ease-out group-hover:scale-105"
        >
          話
        </div>

        <div className="relative flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between md:px-8 md:py-6">
          <div className="min-w-0">
            <span className="text-xs font-medium uppercase tracking-kana text-muted">
              Communauté
            </span>
            <h2 className="mt-2 font-display text-xl font-bold tracking-tight">
              Une question ? Rejoins le Discord
            </h2>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
              Bugs, nouveautés, demandes d'ajout, entraide : c'est là que tout se passe.
            </p>
          </div>

          <button
            onClick={openDiscord}
            className="inline-flex shrink-0 items-center gap-2.5 self-start rounded-lg bg-[#5865F2] px-5 py-2.5 font-display text-sm font-bold text-white transition-all hover:brightness-110 md:self-auto"
          >
            <DiscordIcon className="h-4 w-4" />
            Rejoindre
            <ArrowUpRight size={15} className="transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>
      </div>
    </section>
  );
}
