"use client";

import DockMorph from "@/components/ui/dock-morph";
import { Bell, Home, Search, Settings, User } from "lucide-react";

export default function DockMorphDemo() {
  const items = [
    { icon: Home, label: "Home" },
    { icon: Search, label: "Search" },
    { icon: Bell, label: "Notifications" },
    { icon: User, label: "Profile" },
    { icon: Settings, label: "Settings" },
  ];

  return <DockMorph items={items} />;
}
