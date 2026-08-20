import { api } from "./api";

export interface NavItem {
  slug: string;
  name: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const navigationService = {
  getStructure: async (signal?: AbortSignal) => {
    const response = await api.get<NavGroup[]>("/api/navigation", {}, signal);
    return response.data || [];
  },
};

export default navigationService;
