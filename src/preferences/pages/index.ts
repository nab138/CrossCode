import { preferenceRegistry } from "../registry";
import { PreferenceCategory } from "../types";

import { generalPage } from "./general";
import { appearancePage } from "./appearance";
import { appleIdPage } from "./appleId";
import { certificatesPage } from "./certificates";
import { appIdsPage } from "./appIds";
import { developerPage } from "./developer";
import { swiftPage } from "./swift";
import { sourceKitPage } from "./sourcekit";

const generalCategory: PreferenceCategory = {
  id: "general",
  name: "General",
  pages: [generalPage, appearancePage],
};

const appleCategory: PreferenceCategory = {
  id: "apple",
  name: "Apple",
  pages: [appleIdPage, certificatesPage, appIdsPage],
};

const swiftCategory: PreferenceCategory = {
  id: "swift",
  name: "Swift",
  pages: [swiftPage, sourceKitPage],
};

const advancedCategory: PreferenceCategory = {
  id: "advanced",
  name: "Advanced",
  pages: [developerPage],
};

preferenceRegistry.registerCategory(generalCategory);
preferenceRegistry.registerCategory(appleCategory);
preferenceRegistry.registerCategory(swiftCategory);
preferenceRegistry.registerCategory(advancedCategory);

// In theory, maps should preserve insertion order.
// However, I couldn't get the advanced category to appear after the swift category for some reason.
// So now its here.
const categoryOrder = ["general", "apple", "swift", "advanced"];

export { preferenceRegistry, categoryOrder };
