"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ModeToggle() {
    const { theme, setTheme } = useTheme();

    return (
        <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 rounded-xl bg-accent-blue/10 text-accent-blue border border-accent-blue/20 hover:bg-accent-blue/20 transition-all flex items-center justify-center relative overflow-hidden group"
            aria-label="Toggle theme"
        >
            <div className="relative w-5 h-5 flex items-center justify-center">
                <Sun className="h-5 w-5 absolute transition-all duration-300 scale-100 rotate-0 dark:-rotate-90 dark:scale-0 dark:opacity-0" />
                <Moon className="h-5 w-5 absolute transition-all duration-300 scale-0 rotate-90 opacity-0 dark:rotate-0 dark:scale-100 dark:opacity-100" />
            </div>
        </button>
    );
}
