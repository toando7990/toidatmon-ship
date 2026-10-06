import {
  type DishGroup,
  NO_GROUP,
  buildMatcher,
  groupIdFor,
  groupOf,
  suggestGroups,
} from "@/lib/dish-groups";
import { describe, expect, it } from "vitest";

const g = (groupId: string, name: string, keywords: string[], o: number) =>
  ({
    groupId,
    name,
    keywords,
    sortOrder: BigInt(o),
    active: true,
    updatedAt: 0n,
  }) as DishGroup;

const groups = [
  g("pho", "Phở", ["phở"], 0),
  g("bun", "Bún", ["bún"], 10),
  g("mi", "Mì", ["mì"], 20),
  g("banh-mi", "Bánh mì", ["bánh mì"], 30),
  g("trang-mieng", "Tráng miệng", ["sữa chua", "chè"], 40),
  g("do-uong", "Đồ uống", ["nước", "trà", "sữa"], 50),
];
const m = buildMatcher(groups);
const of = (name: string, category = "", a = new Map<string, string>()) =>
  groupOf("t", "i", name, category, m, a);

describe("dish groups", () => {
  it("chọn từ khoá xuất hiện sớm nhất trong tên", () => {
    expect(of("Phở bò nước")).toBe("pho");
    expect(of("Bún bò Huế")).toBe("bun");
    expect(of("Trà đào cam sả")).toBe("do-uong");
  });
  it("cùng vị trí thì từ khoá dài hơn thắng", () => {
    expect(of("Bánh mì chả")).toBe("banh-mi");
    expect(of("Sữa chua nếp cẩm")).toBe("trang-mieng");
    expect(of("Mì xào bò")).toBe("mi");
  });
  it("không dấu / hoa thường vẫn khớp; khớp nguyên từ", () => {
    expect(of("PHO GA")).toBe("pho");
    expect(of("Bunker combo")).toBeNull();
  });
  it("không khớp tên thì xét danh mục", () => {
    expect(of("Cam vắt", "Nước giải khát")).toBe("do-uong");
    expect(of("Gà rán", "Món chính")).toBeNull();
  });
  it("gán tay thắng tự động, '-' = bỏ khỏi nhóm", () => {
    expect(of("Gà rán", "", new Map([["t|i", "mi"]]))).toBe("mi");
    expect(of("Phở bò", "", new Map([["t|i", NO_GROUP]]))).toBeNull();
    // nhóm gán tay đã bị xoá → về tự động
    expect(of("Phở bò", "", new Map([["t|i", "gone"]]))).toBe("pho");
  });
  it("gợi ý nhóm mới từ món chưa có nhóm", () => {
    const s = suggestGroups(
      [
        { name: "Gà rán giòn", category: "Gà" },
        { name: "Gà rán cay", category: "Gà" },
        { name: "Pizza hải sản", category: "Pizza" },
      ],
      groups,
    );
    expect(s.map((x) => x.name)).toEqual(["Gà", "Gà rán"]);
    expect(s[0].count).toBe(2);
  });
  it("mã nhóm không dấu, không trùng", () => {
    expect(groupIdFor("Chè & tráng miệng", groups)).toBe("che-trang-mieng");
    expect(groupIdFor("Phở", groups)).toBe("pho-2");
  });
});
