import assert from "node:assert/strict";
import { test } from "vitest";
import { containerChoices, deleteManagedItem, importManagedItem, moveManagedItem, saveManagedBag, validInventoryImage, type ManagedInventoryActor, type ManagedInventoryItem } from "../src/systems/dnd5e/inventory-management.ts";

function fixture() {
  const items: ManagedInventoryItem[] = [];
  const writes: unknown[] = [];
  const actor: ManagedInventoryActor = {
    type: "character", items, canUserModify: () => true,
    createEmbeddedDocuments: async (_kind, data) => { writes.push(data); return data; },
    updateEmbeddedDocuments: async (_kind, updates) => {
      for (const update of updates) await items.find(item => item.id === update._id)?.update?.(update);
    },
    deleteEmbeddedDocuments: async (_kind, ids) => {
      writes.push({ deleted: ids });
      const removed = items.filter(item => ids.includes(item.id ?? ""));
      items.splice(0, items.length, ...items.filter(item => !ids.includes(item.id ?? "")));
      return removed;
    }
  };
  const add = (id: string, type: string, container: string | null = null) => {
    const system = { container, quantity: 1 };
    const item: ManagedInventoryItem = { id, name: id, type, system, parent: actor, canUserModify: () => true, getUserLevel: () => 3,
      update: async changes => { writes.push(changes); if ("system.container" in changes) system.container = String(changes["system.container"] ?? "") || null; return item; }
    };
    items.push(item); return item;
  };
  return { actor, items, writes, add };
}

test("moves between main inventory and distinct bags while preventing self and descendant cycles", async () => {
  const f = fixture(); f.add("bag", "container"); f.add("pouch", "container", "bag"); f.add("spare", "container");
  const rope = f.add("rope", "loot");
  assert.equal((await moveManagedItem(f.actor, {}, "rope", "bag")).ok, true);
  assert.equal((await moveManagedItem(f.actor, {}, "rope", "spare")).ok, true);
  assert.equal((await moveManagedItem(f.actor, {}, "rope", "")).ok, true);
  assert.equal((await moveManagedItem(f.actor, {}, "bag", "pouch")).reason, "cycle");
  assert.equal((await moveManagedItem(f.actor, {}, "bag", "bag")).reason, "cycle");
  assert.equal((await moveManagedItem(f.actor, {}, "rope", "missing")).ok, false);
  rope.canUserModify = () => false;
  assert.equal((await moveManagedItem(f.actor, {}, "rope", "bag")).reason, "forbidden");
  assert.deepEqual(containerChoices(f.actor, {}).map(c => c.label), ["bag", "bag › pouch", "spare"]);
  assert.deepEqual(containerChoices(f.actor, {}, "bag").map(c => c.id), ["spare"]);
});

test("nested bag moves account for descendant depth", async () => {
  const f = fixture(); for (let i=0;i<5;i++) f.add(String(i), "container", i ? String(i-1) : null);
  f.add("bag", "container"); f.add("rope", "loot", "bag");
  assert.equal((await moveManagedItem(f.actor, {}, "bag", "4")).reason, "depth");
});

test("bag renaming ignores icon changes and does not overwrite contents or system settings", async () => {
  const f = fixture(); f.add("bag", "container");
  assert.equal((await saveManagedBag(f.actor, {}, { id: "bag", name: " Travel bag ", img: "icons/bag.webp" })).ok, true);
  assert.deepEqual(f.writes[0], { name: "Travel bag" });
  assert.equal((await saveManagedBag(f.actor, {}, { name: "", img: "" })).ok, false);
  assert.equal(validInventoryImage("javascript:alert(1)"), false);
  assert.equal((await saveManagedBag(f.actor, {}, { name: "New bag", img: "" })).ok, true);
});

test("deleting a bag preserves nested contents when requested and rejects stale confirmation", async () => {
  const f = fixture(); f.add("bag", "container"); const pouch=f.add("pouch", "container", "bag"); f.add("rope", "loot", "pouch");
  assert.equal((await deleteManagedItem(f.actor, {}, "bag", "keep", [])).reason, "contents-changed");
  assert.equal((await deleteManagedItem(f.actor, {}, "bag", "keep", ["pouch", "rope"])).ok, true);
  assert.equal(f.items.length, 2);
  assert.deepEqual(pouch.system, { container: null, quantity: 1 });
});

test("explicit delete-all removes precisely the reviewed subtree in one request", async () => {
  const f = fixture(); f.add("bag", "container"); f.add("rope", "loot", "bag"); f.add("other", "loot");
  assert.equal((await deleteManagedItem(f.actor, {}, "bag", "delete", ["rope"])).ok, true);
  assert.deepEqual(f.items.map(i=>i.id), ["other"]);
  assert.deepEqual(f.writes, [{ deleted: ["rope", "bag"] }]);
});

test("pending inventory writes reject repeated submissions and release the lock after failure", async () => {
  const f = fixture(); let finish: (() => void) | undefined;
  f.actor.createEmbeddedDocuments = async () => { await new Promise<void>(resolve => {finish=resolve;}); throw new Error("offline"); };
  const first = saveManagedBag(f.actor, {}, { name: "Bag", img: "" });
  assert.equal((await saveManagedBag(f.actor, {}, { name: "Bag", img: "" })).reason, "busy");
  finish?.(); await assert.rejects(first, /offline/);
  f.actor.createEmbeddedDocuments = async (_kind, data) => data;
  assert.equal((await saveManagedBag(f.actor, {}, { name: "Bag", img: "" })).ok, true);
});

test("import validates source permissions and quantity and uses prepared system data", async () => {
  const f = fixture(); const source={documentName:"Item", type:"loot", getUserLevel:()=>3};
  const env={resolve:async()=>source,prepare:async()=>[{_id:"fresh",type:"loot",system:{quantity:1,container:"old",weight:{value:2}}}]};
  assert.equal((await importManagedItem(f.actor, {}, "Item.rope", 3, env)).ok, true);
  assert.deepEqual(f.writes[0], [{_id:"fresh",type:"loot",system:{quantity:3,container:null,weight:{value:2}}}]);
  assert.equal((await importManagedItem(f.actor, {}, "Actor.other.Item.rope", 1, env)).ok,false);
  assert.equal((await importManagedItem(f.actor, {}, "Item.rope", 0, env)).ok,false);
  source.getUserLevel=()=>0;
  assert.equal((await importManagedItem(f.actor, {}, "Item.rope", 1, env)).reason,"forbidden");
});


test("a denied descendant deletion leaves the entire bag untouched", async () => {
  const f=fixture(); f.add("bag","container"); const child=f.add("rope","loot","bag");
  child.canUserModify=(_user,action)=>action!=="delete";
  assert.equal((await deleteManagedItem(f.actor,{},"bag","delete",["rope"])).reason,"forbidden");
  assert.deepEqual(f.writes,[]);
});

test("zero quantity is preserved until an explicit delete, including inside bags", async () => {
  const f=fixture(); f.add("bag","container"); const item=f.add("rope","loot","bag"); item.system={container:"bag",quantity:0};
  assert.equal((await moveManagedItem(f.actor,{},"rope","")).ok,true);
  assert.equal(f.items.includes(item),true);
  assert.equal((await deleteManagedItem(f.actor,{},"rope","keep",[])).ok,true);
  assert.equal(f.items.includes(item),false);
});

test("partial creation is reported without retrying or claiming a complete import", async () => {
  const f=fixture(); f.actor.createEmbeddedDocuments=async()=>[{}];
  const env={resolve:async()=>({documentName:"Item",type:"container",getUserLevel:()=>3}),prepare:async()=>[{_id:"bag",system:{}},{_id:"rope",system:{container:"bag"}}]};
  assert.equal((await importManagedItem(f.actor,{},"Item.bag",1,env)).reason,"partial-import");
  assert.equal((await importManagedItem(f.actor,{},"Item.bag",2,env)).reason,"bag-quantity");
});
