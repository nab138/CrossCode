import { categoryOrder } from "./pages";
import { PreferencePage, PreferenceCategory } from "./types";

class PreferenceRegistry {
  private pages: Map<string, PreferencePage> = new Map();
  private categories: Map<string, PreferenceCategory> = new Map();

  registerPage(page: PreferencePage) {
    this.pages.set(page.id, page);

    if (page.category) {
      if (!this.categories.has(page.category)) {
        this.categories.set(page.category, {
          id: page.category,
          name: page.category,
          pages: [],
        });
      }
      const category = this.categories.get(page.category)!;
      if (!category.pages.find((p) => p.id === page.id)) {
        category.pages.push(page);
      }
    }
  }

  registerCategory(category: PreferenceCategory) {
    this.categories.set(category.id, category);
    category.pages.forEach((page) => {
      page.category = category.id;
      this.pages.set(page.id, page);
    });
  }

  getPage(id: string): PreferencePage | undefined {
    return this.pages.get(id);
  }

  getAllPages(): PreferencePage[] {
    return Array.from(this.pages.values());
  }

  getAllCategories(): PreferenceCategory[] {
    return Array.from(this.categories.values()).sort(
      (a, b) => categoryOrder.indexOf(a.id) - categoryOrder.indexOf(b.id)
    );
  }
}

export const preferenceRegistry = new PreferenceRegistry();
