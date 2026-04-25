const base = import.meta.env.VITE_BASE_PATH ?? ''

export const asset = (file: string) => `${base}/${file}`
