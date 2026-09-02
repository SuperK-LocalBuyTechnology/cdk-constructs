module.exports = {
    parserPreset: {
        parserOpts: {
            headerPattern: /^\[(\w+)\]\s(.+)$/,
            headerCorrespondence: ["type", "subject"],
        },
    },
    rules: {
        "type-enum": [
            2,
            "always",
            [
                "FEATURE",
                "BUG",
                "CHORE",
                "DOCS",
                "TEST",
                "REFACTOR",
                "PERF",
                "STYLE",
                "BUILD",
                "CI",
                "REVERT",
                "RELEASE",
                "HOTFIX",
                "WIP",
            ],
        ],
        "type-case": [2, "always", "upper-case"],
        "type-empty": [2, "never"],
        "subject-empty": [2, "never"],
        "subject-full-stop": [0, "never", "."],
        "header-max-length": [2, "always", 100],
        "body-max-line-length": [0, "always", 200],
    },
};
