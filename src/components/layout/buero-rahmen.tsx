"use client";

import { useSyncExternalStore } from "react";
import type { Rolle } from "@/lib/rollen";
import { BueroMobilMenue } from "./buero-mobil-menue";
import { BueroSeitenleiste } from "./buero-seitenleiste";

const SPEICHER = "buero-seitenleiste-eingeklappt";
const EREIGNIS = "buero-seitenleiste-geaendert";

function abonnieren(melden: () => void) {
  window.addEventListener("storage", melden);
  window.addEventListener(EREIGNIS, melden);
  return () => {
    window.removeEventListener("storage", melden);
    window.removeEventListener(EREIGNIS, melden);
  };
}

function gespeichert(): boolean {
  try {
    return localStorage.getItem(SPEICHER) === "1";
  } catch {
    return false; // Speicher gesperrt: bleibt ausgeklappt
  }
}

/** Rahmen der Büro-Ansicht: feste Seitenleiste (ein-/ausklappbar, der Zustand bleibt gemerkt) und der Inhalt daneben. */
export function BueroRahmen({
  firmenname,
  name,
  rolle,
  children,
}: {
  firmenname: string;
  name: string;
  rolle: Rolle;
  children: React.ReactNode;
}) {
  // Der gemerkte Zustand kommt aus dem Browser-Speicher (auf dem Server gilt „ausgeklappt“).
  const eingeklappt = useSyncExternalStore(abonnieren, gespeichert, () => false);

  function umschalten() {
    try {
      localStorage.setItem(SPEICHER, eingeklappt ? "0" : "1");
    } catch {
      // egal
    }
    window.dispatchEvent(new Event(EREIGNIS));
  }

  return (
    <div className="flex min-h-dvh flex-1" style={{ "--seitenleiste": eingeklappt ? "3.75rem" : "13rem" } as React.CSSProperties}>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-(--seitenleiste) border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 md:block">
        <BueroSeitenleiste firmenname={firmenname} name={name} rolle={rolle} eingeklappt={eingeklappt} onUmschalten={umschalten} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col transition-[padding] duration-200 md:pl-(--seitenleiste)">
        <BueroMobilMenue firmenname={firmenname} name={name} rolle={rolle} />
        <main className="flex-1 p-4 md:px-8 md:py-6">{children}</main>
      </div>
    </div>
  );
}
