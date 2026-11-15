import localFont from "next/font/local";

export const outfit = localFont({ src: "../../../../assets/fonts/trial/Outfit-latin.woff2", weight: "100 900", display: "swap", variable: "--font-outfit" });
export const archivo = localFont({ src: "../../../../assets/fonts/trial/Archivo-latin.woff2", weight: "100 900", display: "swap", variable: "--font-archivo", declarations: [{ prop: "font-stretch", value: "62% 125%" }] });
export const hanken = localFont({ src: "../../../../assets/fonts/trial/HankenGrotesk-latin.woff2", weight: "100 900", display: "swap", variable: "--font-hanken" });
