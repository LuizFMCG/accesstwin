"use client";

let loader: Promise<typeof google> | undefined;

export function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps só pode ser carregado no navegador."));
  }

  const browserWindow = window as typeof window & {
    google?: typeof google;
  };
  if (browserWindow.google?.maps) {
    return Promise.resolve(browserWindow.google);
  }

  if (loader) {
    return loader;
  }

  loader = new Promise((resolve, reject) => {
    const callbackName = "__accessTwinMapsReady";
    const script = document.createElement("script");
    const params = new URLSearchParams({
      key: apiKey,
      v: "weekly",
      libraries: "places",
      loading: "async",
      callback: callbackName,
    });

    Object.assign(window, {
      [callbackName]: () => {
        delete (window as unknown as Record<string, unknown>)[callbackName];
        resolve(window.google);
      },
    });

    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    script.async = true;
    script.onerror = () => {
      loader = undefined;
      reject(new Error("Não foi possível carregar o Google Maps."));
    };
    document.head.appendChild(script);
  });

  return loader;
}
