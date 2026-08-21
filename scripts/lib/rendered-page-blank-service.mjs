export function isRenderedPageBlank(input) {
  if (input.textLineCount > 0 || !input.rgba || input.rgba.length === 0) {
    return false;
  }

  for (let index = 0; index < input.rgba.length; index += 4) {
    if (
      input.rgba[index] < 254 ||
      input.rgba[index + 1] < 254 ||
      input.rgba[index + 2] < 254
    ) {
      return false;
    }
  }

  return true;
}
