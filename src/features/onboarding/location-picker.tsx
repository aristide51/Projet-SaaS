"use client";

import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

type LocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onLocationChange: (latitude: number, longitude: number) => void;
};

const OUAGADOUGOU: [number, number] = [12.3714, -1.5197];

export function LocationPicker({
  latitude,
  longitude,
  onLocationChange,
}: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const pinRef = useRef<import("leaflet").CircleMarker | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const selectedLocationRef = useRef({ latitude, longitude });

  useEffect(() => {
    onLocationChangeRef.current = onLocationChange;
    selectedLocationRef.current = { latitude, longitude };
  }, [latitude, longitude, onLocationChange]);

  useEffect(() => {
    let cancelled = false;
    let map: import("leaflet").Map | undefined;

    void import("leaflet").then((leaflet) => {
      if (cancelled || !containerRef.current) {
        return;
      }

      const initialCenter: [number, number] =
        selectedLocationRef.current.latitude !== null &&
        selectedLocationRef.current.longitude !== null
          ? [
              selectedLocationRef.current.latitude,
              selectedLocationRef.current.longitude,
            ]
          : OUAGADOUGOU;
      const createdMap = leaflet
        .map(containerRef.current)
        .setView(initialCenter, 13);
      const styles = getComputedStyle(document.documentElement);
      const primaryColor = styles.getPropertyValue("--color-primary").trim();
      const surfaceColor = styles.getPropertyValue("--color-surface").trim();
      map = createdMap;
      mapRef.current = createdMap;
      leaflet
        .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        })
        .addTo(createdMap);

      const addPin = (lat: number, lng: number) => {
        pinRef.current?.remove();
        pinRef.current = leaflet
          .circleMarker([lat, lng], {
            color: surfaceColor,
            fillColor: primaryColor,
            fillOpacity: 1,
            radius: 9,
            weight: 3,
          })
          .addTo(createdMap);
      };

      if (
        selectedLocationRef.current.latitude !== null &&
        selectedLocationRef.current.longitude !== null
      ) {
        addPin(
          selectedLocationRef.current.latitude,
          selectedLocationRef.current.longitude,
        );
      }

      createdMap.on("click", (event) => {
        addPin(event.latlng.lat, event.latlng.lng);
        onLocationChangeRef.current(event.latlng.lat, event.latlng.lng);
      });
    });

    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
      pinRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

    if (latitude !== null && longitude !== null) {
      mapRef.current.setView([latitude, longitude]);
      return;
    }

    pinRef.current?.remove();
    pinRef.current = null;
  }, [latitude, longitude]);

  return (
    <div
      aria-label="Carte interactive OpenStreetMap. Clique pour placer l’épingle."
      className="onboarding-map"
      ref={containerRef}
    />
  );
}
