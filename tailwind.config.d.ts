declare const config: {
    darkMode: ["class"];
    content: string[];
    theme: {
        container: {
            center: true;
            padding: string;
            screens: {
                "2xl": string;
            };
        };
        extend: {
            colors: {
                border: string;
                input: string;
                ring: string;
                background: string;
                foreground: string;
                primary: {
                    DEFAULT: string;
                    foreground: string;
                };
                secondary: {
                    DEFAULT: string;
                    foreground: string;
                };
                muted: {
                    DEFAULT: string;
                    foreground: string;
                };
                accent: {
                    DEFAULT: string;
                    foreground: string;
                };
                popover: {
                    DEFAULT: string;
                    foreground: string;
                };
                destructive: {
                    DEFAULT: string;
                    foreground: string;
                };
                card: {
                    DEFAULT: string;
                    foreground: string;
                };
                brand: {
                    musgo: string;
                    oliva: string;
                    dourado: string;
                    creme: string;
                    papel: string;
                    tinta: string;
                };
            };
            fontFamily: {
                heading: [string, string, string, string, string, string, string, string];
                sans: [string, string, string, string, string, string, string, string];
            };
            borderRadius: {
                lg: string;
                md: string;
                sm: string;
            };
            boxShadow: {
                calm: string;
            };
        };
    };
    plugins: never[];
};
export default config;
