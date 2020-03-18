"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
describe("When doing basic logic", () => {
    beforeEach(() => {
    });
    it("should handle flattening of two-dimensional arrays", () => {
        var ar = [
            [1, 2, 3],
            [5, 6]
        ];
        var flatten = [].concat.apply([], ar);
        assert.equal(flatten.length, 5);
        assert.deepEqual(flatten, [1, 2, 3, 5, 6]);
    });
    it("should handle flattening of two-dimensional arrays and combining", () => {
        var master, ar;
        master = [0, 4];
        ar = [
            [1, 2, 3],
            [5, 6]
        ];
        var combined = [].concat.apply(master, ar);
        assert.equal(combined.length, 7);
        assert.deepEqual(combined, [0, 4, 1, 2, 3, 5, 6]);
    });
});
//# sourceMappingURL=basic.js.map