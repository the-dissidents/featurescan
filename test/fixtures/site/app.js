export const data = await fetch('/data');

const list = [1, 2, 3].toSorted((a, b) => a - b);
const has = Object.hasOwn({}, 'x');
const weak = new WeakRef({});
const worker = new Worker(new URL('./worker.js', import.meta.url), {
  type: 'module'
});

class Counter {
  #count = 0;
  label = 'counter';

  static {
    this.created = true;
  }

  get value() {
    return this.#count;
  }
}

const promise = Promise.withResolvers();
const text = 'x'.replaceAll('x', 'y');
const binary = 0b1010;
