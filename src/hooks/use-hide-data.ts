import { useEffect, useState } from "react";

export const HIDE_DATA_KEY = "accounts.hideData.v1";
export const HIDE_DATA_EVENT = "accounts:hideData";

function read(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(HIDE_DATA_KEY) === "1";
}

export function setHideDataGlobal(value: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(HIDE_DATA_KEY, value ? "1" : "0");
  window.dispatchEvent(new CustomEvent(HIDE_DATA_EVENT, { detail: value }));
}

export function useHideData(): [boolean, (v: boolean) => void] {
  const [hide, setHide] = useState<boolean>(false);
  useEffect(() => {
    setHide(read());
    const onCustom = (e: Event) => {
      const v = (e as CustomEvent<boolean>).detail;
      setHide(typeof v === "boolean" ? v : read());
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === HIDE_DATA_KEY) setHide(read());
    };
    window.addEventListener(HIDE_DATA_EVENT, onCustom);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(HIDE_DATA_EVENT, onCustom);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return [hide, setHideDataGlobal];
}