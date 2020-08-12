import VAX from ".";
import exampleSchema from "../../__mocks__/exampleSchema.json";

describe("VAX", () => {
  it("should initialize VAX instance and have options", async () => {
    const vax = new VAX({ schema: exampleSchema });

    expect(vax).not.toBeNull();
  });
});
