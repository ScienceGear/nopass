/** Public support contact info. Override via frontend env vars in .env. */
export const support = {
  brand: "NovaBank",
  email: import.meta.env["VITE_SUPPORT_EMAIL"] ?? "support@novabank.sciencegear.tech",
  phone: import.meta.env["VITE_SUPPORT_PHONE"] ?? "1800-NOVABANK",
  github:
    import.meta.env["VITE_GITHUB_URL"] ?? "https://github.com/ScienceGear/nopass",
};
