import assert from "node:assert/strict";
import { afterEach, test } from "vitest";
import { inventoryImportEnvironment, searchInventoryCatalog } from "../src/systems/dnd5e/inventory-catalog.ts";
const originalGame=Object.getOwnPropertyDescriptor(globalThis,"game");
const originalResolve=Object.getOwnPropertyDescriptor(globalThis,"fromUuid");
afterEach(()=>{
  if(originalGame)Object.defineProperty(globalThis,"game",originalGame);else Reflect.deleteProperty(globalThis,"game");
  if(originalResolve)Object.defineProperty(globalThis,"fromUuid",originalResolve);else Reflect.deleteProperty(globalThis,"fromUuid");
});

test("catalog includes accessible physical items, excludes hidden packs and rules entries, and isolates failed packs",async()=>{
  let hiddenReads=0;
  Object.defineProperty(globalThis,"game",{configurable:true,value:{items:[
    {uuid:"Item.rope",name:"Rope",type:"loot",getUserLevel:()=>3},
    {uuid:"Item.hidden",name:"Rope secret",type:"loot",getUserLevel:()=>0},
    {uuid:"Item.spell",name:"Rope spell",type:"spell",getUserLevel:()=>3}
  ],packs:[
    {collection:"world.gear",documentName:"Item",visible:true,metadata:{label:"Gear"},getIndex:async()=>[{_id:"rope",name:"Rope",type:"loot"},{_id:"spell",name:"Rope spell",type:"spell"}]},
    {collection:"world.hidden",documentName:"Item",visible:false,getIndex:async()=>{hiddenReads++;return [];}},
    {collection:"world.broken",documentName:"Item",visible:true,getIndex:async()=>{throw Error("offline");}}
  ]}});
  const result=await searchInventoryCatalog("rope",{});
  assert.deepEqual(result.entries.map(e=>e.uuid).sort(),["Compendium.world.gear.Item.rope","Item.rope"]);
  assert.equal(result.failures,1);assert.equal(hiddenReads,0);
  assert.deepEqual(await searchInventoryCatalog(" ",{}),{entries:[],failures:0});
});

test("import preparation uses native container copying and refuses inaccessible descendants",async()=>{
  let checked=0;
  class Source {
    documentName="Item";type="container";uuid="Item.bag";
    getUserLevel(){return 3;}
    static async createWithContents(items: Source[], options: {transformAll:(item:Source)=>Source}) {
      checked++; options.transformAll(items[0] ?? new Source());
      const hidden=new Source();hidden.getUserLevel=()=>0;
      options.transformAll(hidden);
      return [];
    }
  }
  Object.defineProperty(globalThis,"fromUuid",{configurable:true,value:async()=>new Source()});
  const environment=inventoryImportEnvironment({});
  const source=await environment.resolve("Item.bag");assert.ok(source);
  await assert.rejects(environment.prepare(source),/not accessible/);
  assert.equal(checked,1);
});
