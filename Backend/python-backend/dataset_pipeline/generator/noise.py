import random


def add_ocr_noise(text):

    replacements = {
        "o": ["0"],
        "e": ["c"],
        "i": ["l"],
        "m": ["rn"],
        "s": ["5"]
    }

    chars = list(text)

    for i in range(len(chars)):
        if chars[i].lower() in replacements and random.random() < 0.02:
            chars[i] = random.choice(replacements[chars[i].lower()])

    text = "".join(chars)

    # random spacing errors
    if random.random() < 0.3:
        text = text.replace(" ", "  ")

    return text
