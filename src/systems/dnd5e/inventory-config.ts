export const SECTION_ORDER = ["weapon", "equipment", "consumable", "tool", "loot", "container"] as const;

export type InventorySectionId = (typeof SECTION_ORDER)[number];
export type InventoryFactField = "charges" | "quantity" | "weight" | "value" | "damage";

export type InventoryListColumnConfig = {
  id: string;
  label: string;
};

export const SECTION_CONFIG: Record<InventorySectionId, {
  label: string;
  listColumns: InventoryListColumnConfig[];
  shownFactFields: readonly InventoryFactField[];
}> = {
  weapon: {
    label: "Weapons",
    listColumns: [
      { id: "roll", label: "Roll" },
      { id: "formula", label: "Formula" },
      { id: "charges", label: "Charges" }
    ],
    shownFactFields: ["charges", "damage"]
  },
  equipment: {
    label: "Equipment",
    listColumns: [
      { id: "weight", label: "Weight" },
      { id: "quantity", label: "Quantity" },
      { id: "charges", label: "Charges" }
    ],
    shownFactFields: ["charges", "quantity", "weight"]
  },
  consumable: {
    label: "Consumables",
    listColumns: [
      { id: "quantity", label: "Quantity" },
      { id: "charges", label: "Charges" },
      { id: "weight", label: "Weight" }
    ],
    shownFactFields: ["charges", "quantity", "weight"]
  },
  tool: {
    label: "Tools",
    listColumns: [
      { id: "weight", label: "Weight" },
      { id: "quantity", label: "Quantity" },
      { id: "charges", label: "Charges" }
    ],
    shownFactFields: ["charges", "quantity", "weight"]
  },
  loot: {
    label: "Loot",
    listColumns: [
      { id: "quantity", label: "Quantity" },
      { id: "weight", label: "Weight" },
      { id: "value", label: "Value" }
    ],
    shownFactFields: ["quantity", "weight", "value"]
  },
  container: {
    label: "Containers",
    listColumns: [
      { id: "capacity", label: "Capacity" },
      { id: "contents", label: "Contents" },
      { id: "quantity", label: "Quantity" }
    ],
    shownFactFields: ["quantity"]
  }
};
