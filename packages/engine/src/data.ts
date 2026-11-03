import { z } from "zod";
import boardData from "../../../data/board.json";
import cardsData from "../../../data/cards.json";

const tileType = z.enum(["go", "property", "community_chest", "tax", "railroad", "chance", "utility", "jail", "free_parking", "go_to_jail"]);
const tileSchema = z.object({
  index: z.number().int().nonnegative(), type: tileType, name: z.string(),
  salary: z.number().int().nonnegative().optional(), amount: z.number().int().nonnegative().optional(),
  country: z.string().optional(), colorGroup: z.string().optional(), price: z.number().int().positive().optional(),
  mortgage: z.number().int().nonnegative().optional(), houseCost: z.number().int().positive().optional(),
  rent: z.union([
    z.array(z.number().int().nonnegative()).length(4),
    z.array(z.number().int().nonnegative()).length(6)
  ]).optional(), funFact: z.string().optional(), flavor: z.string().optional()
});
const cardSchema = z.object({
  deck: z.enum(["chance", "community_chest"]), id: z.string(), text: z.string(), effect: z.string(),
  target: z.number().int().nonnegative().optional(), kind: z.string().optional(), rentMultiplier: z.number().positive().optional(),
  diceMultiplier: z.number().positive().optional(), amount: z.number().int().optional(), steps: z.number().int().optional(),
  house: z.number().int().nonnegative().optional(), hotel: z.number().int().nonnegative().optional()
});
export const boardSchema = z.object({
  theme: z.string(), startingCash: z.number().int().positive(), goSalary: z.number().int().positive(),
  totalHouses: z.number().int().positive(), totalHotels: z.number().int().positive(),
  colorGroups: z.record(z.string()), tiles: z.array(tileSchema).length(40)
});
export const cardsSchema = z.array(cardSchema).length(32);
export type BoardTile = z.infer<typeof tileSchema>;
export type Card = z.infer<typeof cardSchema>;
export const board = boardSchema.parse(boardData);
export const cards = cardsSchema.parse(cardsData);
const unique = <T>(values: T[]): boolean => new Set(values).size === values.length;
if (!unique(board.tiles.map((tile) => tile.index)) || board.tiles.some((tile, index) => tile.index !== index)) {
  throw new Error("Board tile indices must be unique and contiguous");
}
if (!unique(cards.map((card) => card.id))) throw new Error("Card IDs must be unique");
export function getTile(index: number): BoardTile {
  const tile = board.tiles[index];
  if (!tile) throw new Error(`Unknown board tile: ${index}`);
  return tile;
}
export function getCard(id: string): Card {
  const card = cards.find((item) => item.id === id);
  if (!card) throw new Error(`Unknown card: ${id}`);
  return card;
}
