import assert = require('assert');

describe("When doing basic logic", () => {
    
    beforeEach(() => {
        
    })

    it("should handle flattening of two-dimensional arrays", () => {
        var ar = [
            [1, 2, 3],
            [5, 6]
        ];

        var flatten = [].concat.apply([], ar);

        assert.equal(flatten.length, 5);
        assert.deepEqual(flatten, [1, 2, 3, 5, 6]);
    })

    it("should handle flattening of two-dimensional arrays and combining", () => {
        var master: Array<number>, ar: Array<Array<number>>;


        master = [0, 4];
        ar = [
            [1, 2, 3],
            [5, 6]
        ];
        
        var combined: Array<number> = [].concat.apply(master, ar);

        assert.equal(combined.length, 7);
        assert.deepEqual(combined, [0, 4, 1, 2, 3, 5, 6]);
    })
})