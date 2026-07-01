var config = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx}"],
    theme: {
        container: {
            center: true,
            padding: "1rem",
            screens: {
                "2xl": "1200px",
            },
        },
        extend: {
            colors: {
                border: "hsl(var(--border))",
                input: "hsl(var(--input))",
                ring: "hsl(var(--ring))",
                background: "hsl(var(--background))",
                foreground: "hsl(var(--foreground))",
                primary: {
                    DEFAULT: "hsl(var(--primary))",
                    foreground: "hsl(var(--primary-foreground))",
                },
                secondary: {
                    DEFAULT: "hsl(var(--secondary))",
                    foreground: "hsl(var(--secondary-foreground))",
                },
                muted: {
                    DEFAULT: "hsl(var(--muted))",
                    foreground: "hsl(var(--muted-foreground))",
                },
                accent: {
                    DEFAULT: "hsl(var(--accent))",
                    foreground: "hsl(var(--accent-foreground))",
                },
                popover: {
                    DEFAULT: "hsl(var(--popover))",
                    foreground: "hsl(var(--popover-foreground))",
                },
                destructive: {
                    DEFAULT: "hsl(var(--destructive))",
                    foreground: "hsl(var(--destructive-foreground))",
                },
                card: {
                    DEFAULT: "hsl(var(--card))",
                    foreground: "hsl(var(--card-foreground))",
                },
                brand: {
                    musgo: "var(--bratan-musgo)",
                    oliva: "var(--bratan-oliva)",
                    dourado: "var(--bratan-dourado)",
                    creme: "var(--bratan-creme)",
                    papel: "var(--bratan-papel)",
                    tinta: "var(--bratan-tinta)",
                },
            },
            fontFamily: {
                heading: [
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "SF Pro Display",
                    "SF Pro Text",
                    "Inter",
                    "ui-sans-serif",
                    "system-ui",
                    "sans-serif",
                ],
                sans: [
                    "-apple-system",
                    "BlinkMacSystemFont",
                    "SF Pro Text",
                    "SF Pro Display",
                    "Inter",
                    "ui-sans-serif",
                    "system-ui",
                    "sans-serif",
                ],
            },
            borderRadius: {
                lg: "8px",
                md: "6px",
                sm: "4px",
            },
            boxShadow: {
                calm: "0 18px 40px rgba(43, 46, 36, 0.08)",
                ios: "0 22px 55px rgba(43, 46, 36, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.68)",
                "ios-dock": "0 22px 60px rgba(43, 46, 36, 0.20), inset 0 1px 0 rgba(255, 255, 255, 0.82)",
            },
            keyframes: {
                spotlight: {
                    "0%": { opacity: "0", transform: "translate(-72%, -62%) scale(0.5)" },
                    "100%": { opacity: "1", transform: "translate(-50%, -40%) scale(1)" },
                },
            },
            animation: {
                spotlight: "spotlight 2s ease 0.75s 1 forwards",
            },
        },
    },
    plugins: [],
};
export default config;
