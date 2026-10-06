Object.defineProperty(HTMLElement.prototype, 'getClientRects', {
  configurable: true,
  value() { return this.hidden ? [] : [{ width: 100, height: 20 }] },
})
