'use strict';

var require$$0$3 = require('events');
var require$$1$1 = require('https');
var require$$2$1 = require('http');
var require$$3 = require('net');
var require$$4 = require('tls');
var require$$1 = require('crypto');
var require$$0$2 = require('stream');
var require$$7 = require('url');
var require$$0 = require('zlib');
var require$$0$1 = require('buffer');
var require$$2 = require('util');
var fs = require('node:fs');
var path = require('node:path');
var node_process = require('node:process');
var node_crypto = require('node:crypto');
var node_child_process = require('node:child_process');
var node_os = require('node:os');
var node_util = require('node:util');

/**
 * Default language supported by all i18n providers.
 */
const defaultLanguage = "en";

/**
 * Creates a {@link IDisposable} that defers the disposing to the {@link dispose} function; disposing is guarded so that it may only occur once.
 * @param dispose Function responsible for disposing.
 * @returns Disposable whereby the disposing is delegated to the {@link dispose}  function.
 */
function deferredDisposable(dispose) {
    let isDisposed = false;
    const guardedDispose = () => {
        if (!isDisposed) {
            dispose();
            isDisposed = true;
        }
    };
    return {
        [Symbol.dispose]: guardedDispose,
        dispose: guardedDispose,
    };
}

/**
 * An event emitter that enables the listening for, and emitting of, events.
 */
class EventEmitter {
    /**
     * Underlying collection of events and their listeners.
     */
    events = new Map();
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the {@link listener} added.
     */
    addListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}, and returns a disposable capable of removing the event listener.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns A disposable that removes the listener when disposed.
     */
    disposableOn(eventName, listener) {
        this.add(eventName, listener, (listeners) => listeners.push({ listener }));
        return deferredDisposable(() => this.removeListener(eventName, listener));
    }
    /**
     * Emits the {@link eventName}, invoking all event listeners with the specified {@link args}.
     * @param eventName Name of the event.
     * @param args Arguments supplied to each event listener.
     * @returns `true` when there was a listener associated with the event; otherwise `false`.
     */
    emit(eventName, ...args) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined) {
            return false;
        }
        for (let i = 0; i < listeners.length;) {
            const { listener, once } = listeners[i];
            if (once) {
                this.remove(eventName, listeners, i);
            }
            else {
                i++;
            }
            listener(...args);
        }
        return true;
    }
    /**
     * Gets the event names with event listeners.
     * @returns Event names.
     */
    eventNames() {
        return Array.from(this.events.keys());
    }
    /**
     * Gets the number of event listeners for the event named {@link eventName}. When a {@link listener} is defined, only matching event listeners are counted.
     * @param eventName Name of the event.
     * @param listener Optional event listener to count.
     * @returns Number of event listeners.
     */
    listenerCount(eventName, listener) {
        const listeners = this.events.get(eventName);
        if (listeners === undefined || listener == undefined) {
            return listeners?.length || 0;
        }
        let count = 0;
        listeners.forEach((ev) => {
            if (ev.listener === listener) {
                count++;
            }
        });
        return count;
    }
    /**
     * Gets the event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns The event listeners.
     */
    listeners(eventName) {
        return Array.from(this.events.get(eventName) || []).map(({ listener }) => listener);
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    off(eventName, listener) {
        const listeners = this.events.get(eventName) ?? [];
        for (let i = listeners.length - 1; i >= 0; i--) {
            if (listeners[i].listener === listener) {
                this.remove(eventName, listeners, i);
            }
        }
        return this;
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    on(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} added.
     */
    once(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.push({ listener, once: true }));
    }
    /**
     * Adds the event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener }));
    }
    /**
     * Adds the **one-time** event {@link listener} to the beginning of the listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} prepended.
     */
    prependOnceListener(eventName, listener) {
        return this.add(eventName, listener, (listeners) => listeners.splice(0, 0, { listener, once: true }));
    }
    /**
     * Removes all event listeners for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @returns This instance with the event listeners removed
     */
    removeAllListeners(eventName) {
        const listeners = this.events.get(eventName) ?? [];
        while (listeners.length > 0) {
            this.remove(eventName, listeners, 0);
        }
        this.events.delete(eventName);
        return this;
    }
    /**
     * Removes the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @returns This instance with the event {@link listener} removed.
     */
    removeListener(eventName, listener) {
        return this.off(eventName, listener);
    }
    /**
     * Adds the event {@link listener} for the event named {@link eventName}.
     * @param eventName Name of the event.
     * @param listener Event handler function.
     * @param fn Function responsible for adding the new event handler function.
     * @returns This instance with event {@link listener} added.
     */
    add(eventName, listener, fn) {
        let listeners = this.events.get(eventName);
        if (listeners === undefined) {
            listeners = [];
            this.events.set(eventName, listeners);
        }
        fn(listeners);
        if (eventName !== "newListener") {
            const args = [eventName, listener];
            this.emit("newListener", ...args);
        }
        return this;
    }
    /**
     * Removes the listener at the given index.
     * @param eventName Name of the event.
     * @param listeners Listeners registered with the event.
     * @param index Index of the listener to remove.
     */
    remove(eventName, listeners, index) {
        const [{ listener }] = listeners.splice(index, 1);
        if (eventName !== "removeListener") {
            const args = [eventName, listener];
            this.emit("removeListener", ...args);
        }
    }
}

/**
 * Prevents the modification of existing property attributes and values on the value, and all of its child properties, and prevents the addition of new properties.
 * @param value Value to freeze.
 */
function freeze(value) {
    if (value !== undefined && value !== null && typeof value === "object" && !Object.isFrozen(value)) {
        Object.freeze(value);
        Object.values(value).forEach(freeze);
    }
}
/**
 * Gets the value at the specified {@link path}.
 * @param source Source object that is being read from.
 * @param path Path to the property to get.
 * @returns Value of the property.
 */
function get(source, path) {
    const props = path.split(".");
    return props.reduce((obj, prop) => obj && obj[prop], source);
}

/**
 * Internalization provider, responsible for managing localizations and translating resources.
 */
class I18nProvider {
    /**
     * Backing field for the default language.
     */
    #language;
    /**
     * Map of localized resources, indexed by their language.
     */
    #translations = new Map();
    /**
     * Function responsible for providing localized resources for a given language.
     */
    #readTranslations;
    /**
     * Internal events handler.
     */
    #events = new EventEmitter();
    /**
     * Initializes a new instance of the {@link I18nProvider} class.
     * @param language The default language to be used when retrieving translations for a given key.
     * @param readTranslations Function responsible for providing localized resources for a given language.
     */
    constructor(language, readTranslations) {
        this.#language = language;
        this.#readTranslations = readTranslations;
    }
    /**
     * The default language of the provider.
     * @returns The language.
     */
    get language() {
        return this.#language;
    }
    /**
     * The default language of the provider.
     * @param value The language.
     */
    set language(value) {
        if (this.#language !== value) {
            this.#language = value;
            this.#events.emit("languageChange", value);
        }
    }
    /**
     * Adds an event listener that is called when the language within the provider changes.
     * @param listener Listener function to be called.
     * @returns Resource manager that, when disposed, removes the event listener.
     */
    onLanguageChange(listener) {
        return this.#events.disposableOn("languageChange", listener);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked. Alias of {@link I18nProvider.translate}.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    t(key, language = this.language) {
        return this.translate(key, language);
    }
    /**
     * Translates the specified {@link key}, as defined within the resources for the {@link language}.
     * When the key is not found, the default language is checked.
     * @param key Key of the translation.
     * @param language Optional language to get the translation for; otherwise the default language.
     * @returns The translation; otherwise the key.
     */
    translate(key, language = this.language) {
        // Determine the languages to search for.
        const languages = new Set([
            language,
            language.replaceAll("_", "-").split("-").at(0),
            defaultLanguage,
        ]);
        // Attempt to find the resource for the languages.
        for (const language of languages) {
            const resource = get(this.getTranslations(language), key);
            if (resource) {
                return resource.toString();
            }
        }
        // Otherwise fallback to the key.
        return key;
    }
    /**
     * Gets the translations for the specified language.
     * @param language Language whose translations are being retrieved.
     * @returns The translations; otherwise `null`.
     */
    getTranslations(language) {
        let translations = this.#translations.get(language);
        if (translations === undefined) {
            translations = this.#readTranslations(language);
            freeze(translations);
            this.#translations.set(language, translations);
        }
        return translations;
    }
}

/**
 * Provides a read-only iterable collection of items that also acts as a partial polyfill for iterator helpers.
 */
class Enumerable {
    /**
     * Backing function responsible for providing the iterator of items.
     */
    #items;
    /**
     * Backing function for {@link Enumerable.length}.
     */
    #length;
    /**
     * Captured iterator from the underlying iterable; used to fulfil {@link IterableIterator} methods.
     */
    #iterator;
    /**
     * Initializes a new instance of the {@link Enumerable} class.
     * @param source Source that contains the items.
     * @returns The enumerable.
     */
    constructor(source) {
        if (source instanceof Enumerable) {
            // Enumerable
            this.#items = source.#items;
            this.#length = source.#length;
        }
        else if (Array.isArray(source)) {
            // Array
            this.#items = () => source.values();
            this.#length = () => source.length;
        }
        else if (source instanceof Map || source instanceof Set) {
            // Map or Set
            this.#items = () => source.values();
            this.#length = () => source.size;
        }
        else {
            // IterableIterator delegate
            this.#items = source;
            this.#length = () => {
                let i = 0;
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                for (const _ of this) {
                    i++;
                }
                return i;
            };
        }
    }
    /**
     * Gets the number of items in the enumerable.
     * @returns The number of items.
     */
    get length() {
        return this.#length();
    }
    /**
     * Gets the iterator for the enumerable.
     * @yields The items.
     */
    *[Symbol.iterator]() {
        for (const item of this.#items()) {
            yield item;
        }
    }
    /**
     * Transforms each item within this iterator to an indexed pair, with each pair represented as an array.
     * @returns An iterator of indexed pairs.
     */
    asIndexedPairs() {
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                yield [i++, item];
            }
        }.bind(this));
    }
    /**
     * Returns an iterator with the first items dropped, up to the specified limit.
     * @param limit The number of elements to drop from the start of the iteration.
     * @returns An iterator of items after the limit.
     */
    drop(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ >= limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Determines whether all items satisfy the specified predicate.
     * @param predicate Function that determines whether each item fulfils the predicate.
     * @returns `true` when all items satisfy the predicate; otherwise `false`.
     */
    every(predicate) {
        for (const item of this) {
            if (!predicate(item)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Returns an iterator of items that meet the specified predicate..
     * @param predicate Function that determines which items to filter.
     * @returns An iterator of filtered items.
     */
    filter(predicate) {
        return new Enumerable(function* () {
            for (const item of this) {
                if (predicate(item)) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Finds the first item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    find(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return item;
            }
        }
    }
    /**
     * Finds the last item that satisfies the specified predicate.
     * @param predicate Predicate to match items against.
     * @returns The first item that satisfied the predicate; otherwise `undefined`.
     */
    findLast(predicate) {
        let result = undefined;
        for (const item of this) {
            if (predicate(item)) {
                result = item;
            }
        }
        return result;
    }
    /**
     * Returns an iterator containing items transformed using the specified mapper function.
     * @param mapper Function responsible for transforming each item.
     * @returns An iterator of transformed items.
     */
    flatMap(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                for (const mapped of mapper(item)) {
                    yield mapped;
                }
            }
        }.bind(this));
    }
    /**
     * Iterates over each item, and invokes the specified function.
     * @param fn Function to invoke against each item.
     */
    forEach(fn) {
        for (const item of this) {
            fn(item);
        }
    }
    /**
     * Determines whether the search item exists in the collection exists.
     * @param search Item to search for.
     * @returns `true` when the item was found; otherwise `false`.
     */
    includes(search) {
        return this.some((item) => item === search);
    }
    /**
     * Returns an iterator of mapped items using the mapper function.
     * @param mapper Function responsible for mapping the items.
     * @returns An iterator of mapped items.
     */
    map(mapper) {
        return new Enumerable(function* () {
            for (const item of this) {
                yield mapper(item);
            }
        }.bind(this));
    }
    /**
     * Captures the underlying iterable, if it is not already captured, and gets the next item in the iterator.
     * @param args Optional values to send to the generator.
     * @returns An iterator result of the current iteration; when `done` is `false`, the current `value` is provided.
     */
    next(...args) {
        this.#iterator ??= this.#items();
        const result = this.#iterator.next(...args);
        if (result.done) {
            this.#iterator = undefined;
        }
        return result;
    }
    /**
     * Applies the accumulator function to each item, and returns the result.
     * @param accumulator Function responsible for accumulating all items within the collection.
     * @param initial Initial value supplied to the accumulator.
     * @returns Result of accumulating each value.
     */
    reduce(accumulator, initial) {
        if (this.length === 0) {
            if (initial === undefined) {
                throw new TypeError("Reduce of empty enumerable with no initial value.");
            }
            return initial;
        }
        let result = initial;
        for (const item of this) {
            if (result === undefined) {
                result = item;
            }
            else {
                result = accumulator(result, item);
            }
        }
        return result;
    }
    /**
     * Acts as if a `return` statement is inserted in the generator's body at the current suspended position.
     *
     * Please note, in the context of an {@link Enumerable}, calling {@link Enumerable.return} will clear the captured iterator,
     * if there is one. Subsequent calls to {@link Enumerable.next} will result in re-capturing the underlying iterable, and
     * yielding items from the beginning.
     * @param value Value to return.
     * @returns The value as an iterator result.
     */
    return(value) {
        this.#iterator = undefined;
        return { done: true, value };
    }
    /**
     * Determines whether an item in the collection exists that satisfies the specified predicate.
     * @param predicate Function used to search for an item.
     * @returns `true` when the item was found; otherwise `false`.
     */
    some(predicate) {
        for (const item of this) {
            if (predicate(item)) {
                return true;
            }
        }
        return false;
    }
    /**
     * Returns an iterator with the items, from 0, up to the specified limit.
     * @param limit Limit of items to take.
     * @returns An iterator of items from 0 to the limit.
     */
    take(limit) {
        if (isNaN(limit) || limit < 0) {
            throw new RangeError("limit must be 0, or a positive number");
        }
        return new Enumerable(function* () {
            let i = 0;
            for (const item of this) {
                if (i++ < limit) {
                    yield item;
                }
            }
        }.bind(this));
    }
    /**
     * Acts as if a `throw` statement is inserted in the generator's body at the current suspended position.
     * @param e Error to throw.
     */
    throw(e) {
        throw e;
    }
    /**
     * Converts this iterator to an array.
     * @returns The array of items from this iterator.
     */
    toArray() {
        return Array.from(this);
    }
    /**
     * Converts this iterator to serializable collection.
     * @returns The serializable collection of items.
     */
    toJSON() {
        return this.toArray();
    }
    /**
     * Converts this iterator to a string.
     * @returns The string.
     */
    toString() {
        return `${this.toArray()}`;
    }
}

// Polyfill, explicit resource management https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-2.html#using-declarations-and-explicit-resource-management
// eslint-disable-next-line @typescript-eslint/no-explicit-any
Symbol.dispose ??= Symbol("Symbol.dispose");

/**
 * Provides a wrapper around a value that is lazily instantiated.
 */
class Lazy {
    /**
     * Private backing field for {@link Lazy.value}.
     */
    #value = undefined;
    /**
     * Factory responsible for instantiating the value.
     */
    #valueFactory;
    /**
     * Initializes a new instance of the {@link Lazy} class.
     * @param valueFactory The factory responsible for instantiating the value.
     */
    constructor(valueFactory) {
        this.#valueFactory = valueFactory;
    }
    /**
     * Gets the value.
     * @returns The value.
     */
    get value() {
        if (this.#value === undefined) {
            this.#value = this.#valueFactory();
        }
        return this.#value;
    }
}

/**
 * Returns an object that contains a promise and two functions to resolve or reject it.
 * @returns The promise, and the resolve and reject functions.
 */
function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

/** A special constant with type `never` */
function $constructor(name, initializer, params) {
    function init(inst, def) {
        var _a;
        Object.defineProperty(inst, "_zod", {
            value: inst._zod ?? {},
            enumerable: false,
        });
        (_a = inst._zod).traits ?? (_a.traits = new Set());
        inst._zod.traits.add(name);
        initializer(inst, def);
        // support prototype modifications
        for (const k in _.prototype) {
            if (!(k in inst))
                Object.defineProperty(inst, k, { value: _.prototype[k].bind(inst) });
        }
        inst._zod.constr = _;
        inst._zod.def = def;
    }
    // doesn't work if Parent has a constructor with arguments
    const Parent = params?.Parent ?? Object;
    class Definition extends Parent {
    }
    Object.defineProperty(Definition, "name", { value: name });
    function _(def) {
        var _a;
        const inst = params?.Parent ? new Definition() : this;
        init(inst, def);
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        for (const fn of inst._zod.deferred) {
            fn();
        }
        return inst;
    }
    Object.defineProperty(_, "init", { value: init });
    Object.defineProperty(_, Symbol.hasInstance, {
        value: (inst) => {
            if (params?.Parent && inst instanceof params.Parent)
                return true;
            return inst?._zod?.traits?.has(name);
        },
    });
    Object.defineProperty(_, "name", { value: name });
    return _;
}
class $ZodAsyncError extends Error {
    constructor() {
        super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
    }
}
const globalConfig = {};
function config(newConfig) {
    return globalConfig;
}

// functions
function jsonStringifyReplacer(_, value) {
    if (typeof value === "bigint")
        return value.toString();
    return value;
}
function cached$1(getter) {
    return {
        get value() {
            {
                const value = getter();
                Object.defineProperty(this, "value", { value });
                return value;
            }
        },
    };
}
function cleanRegex(source) {
    const start = source.startsWith("^") ? 1 : 0;
    const end = source.endsWith("$") ? source.length - 1 : source.length;
    return source.slice(start, end);
}
function defineLazy(object, key, getter) {
    Object.defineProperty(object, key, {
        get() {
            {
                const value = getter();
                object[key] = value;
                return value;
            }
        },
        set(v) {
            Object.defineProperty(object, key, {
                value: v,
                // configurable: true,
            });
            // object[key] = v;
        },
        configurable: true,
    });
}
function assignProp(target, prop, value) {
    Object.defineProperty(target, prop, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
    });
}
function esc(str) {
    return JSON.stringify(str);
}
const captureStackTrace = Error.captureStackTrace
    ? Error.captureStackTrace
    : (..._args) => { };
function isObject(data) {
    return typeof data === "object" && data !== null && !Array.isArray(data);
}
const allowsEval = cached$1(() => {
    if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
        return false;
    }
    try {
        const F = Function;
        new F("");
        return true;
    }
    catch (_) {
        return false;
    }
});
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
// zod-specific utils
function clone(inst, def, params) {
    const cl = new inst._zod.constr(def ?? inst._zod.def);
    if (!def || params?.parent)
        cl._zod.parent = inst;
    return cl;
}
function normalizeParams(_params) {
    return {};
}
function optionalKeys(shape) {
    return Object.keys(shape).filter((k) => {
        return shape[k]._zod.optin === "optional" && shape[k]._zod.optout === "optional";
    });
}
function aborted(x, startIndex = 0) {
    for (let i = startIndex; i < x.issues.length; i++) {
        if (x.issues[i]?.continue !== true)
            return true;
    }
    return false;
}
function prefixIssues(path, issues) {
    return issues.map((iss) => {
        var _a;
        (_a = iss).path ?? (_a.path = []);
        iss.path.unshift(path);
        return iss;
    });
}
function unwrapMessage(message) {
    return typeof message === "string" ? message : message?.message;
}
function finalizeIssue(iss, ctx, config) {
    const full = { ...iss, path: iss.path ?? [] };
    // for backwards compatibility
    if (!iss.message) {
        const message = unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ??
            unwrapMessage(ctx?.error?.(iss)) ??
            unwrapMessage(config.customError?.(iss)) ??
            unwrapMessage(config.localeError?.(iss)) ??
            "Invalid input";
        full.message = message;
    }
    // delete (full as any).def;
    delete full.inst;
    delete full.continue;
    if (!ctx?.reportInput) {
        delete full.input;
    }
    return full;
}

const initializer = (inst, def) => {
    inst.name = "$ZodError";
    Object.defineProperty(inst, "_zod", {
        value: inst._zod,
        enumerable: false,
    });
    Object.defineProperty(inst, "issues", {
        value: def,
        enumerable: false,
    });
    Object.defineProperty(inst, "message", {
        get() {
            return JSON.stringify(def, jsonStringifyReplacer, 2);
        },
        enumerable: true,
        // configurable: false,
    });
    Object.defineProperty(inst, "toString", {
        value: () => inst.message,
        enumerable: false,
    });
};
const $ZodError = $constructor("$ZodError", initializer);
const $ZodRealError = $constructor("$ZodError", initializer, { Parent: Error });

const _parse = (_Err) => (schema, value, _ctx, _params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: false }) : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    if (result.issues.length) {
        const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, _params?.callee);
        throw e;
    }
    return result.value;
};
const parse = /* @__PURE__*/ _parse($ZodRealError);
const _parseAsync = (_Err) => async (schema, value, _ctx, params) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    if (result.issues.length) {
        const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
        captureStackTrace(e, params?.callee);
        throw e;
    }
    return result.value;
};
const parseAsync = /* @__PURE__*/ _parseAsync($ZodRealError);
const _safeParse = (_Err) => (schema, value, _ctx) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
        throw new $ZodAsyncError();
    }
    return result.issues.length
        ? {
            success: false,
            error: new (_Err ?? $ZodError)(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParse = /* @__PURE__*/ _safeParse($ZodRealError);
const _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
    const ctx = _ctx ? Object.assign(_ctx, { async: true }) : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
        result = await result;
    return result.issues.length
        ? {
            success: false,
            error: new _Err(result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
        }
        : { success: true, data: result.value };
};
const safeParseAsync = /* @__PURE__*/ _safeParseAsync($ZodRealError);

const string$1 = (params) => {
    const regex = params ? `[\\s\\S]{${params?.minimum ?? 0},${params?.maximum ?? ""}}` : `[\\s\\S]*`;
    return new RegExp(`^${regex}$`);
};
const number$1 = /^-?\d+(?:\.\d+)?/i;
const boolean$1 = /true|false/i;

class Doc {
    constructor(args = []) {
        this.content = [];
        this.indent = 0;
        if (this)
            this.args = args;
    }
    indented(fn) {
        this.indent += 1;
        fn(this);
        this.indent -= 1;
    }
    write(arg) {
        if (typeof arg === "function") {
            arg(this, { execution: "sync" });
            arg(this, { execution: "async" });
            return;
        }
        const content = arg;
        const lines = content.split("\n").filter((x) => x);
        const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
        const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
        for (const line of dedented) {
            this.content.push(line);
        }
    }
    compile() {
        const F = Function;
        const args = this?.args;
        const content = this?.content ?? [``];
        const lines = [...content.map((x) => `  ${x}`)];
        // console.log(lines.join("\n"));
        return new F(...args, lines.join("\n"));
    }
}

const version = {
    major: 4,
    minor: 0,
    patch: 0,
};

const $ZodType = /*@__PURE__*/ $constructor("$ZodType", (inst, def) => {
    var _a;
    inst ?? (inst = {});
    inst._zod.def = def; // set _def property
    inst._zod.bag = inst._zod.bag || {}; // initialize _bag object
    inst._zod.version = version;
    const checks = [...(inst._zod.def.checks ?? [])];
    // if inst is itself a checks.$ZodCheck, run it as a check
    if (inst._zod.traits.has("$ZodCheck")) {
        checks.unshift(inst);
    }
    //
    for (const ch of checks) {
        for (const fn of ch._zod.onattach) {
            fn(inst);
        }
    }
    if (checks.length === 0) {
        // deferred initializer
        // inst._zod.parse is not yet defined
        (_a = inst._zod).deferred ?? (_a.deferred = []);
        inst._zod.deferred?.push(() => {
            inst._zod.run = inst._zod.parse;
        });
    }
    else {
        const runChecks = (payload, checks, ctx) => {
            let isAborted = aborted(payload);
            let asyncResult;
            for (const ch of checks) {
                if (ch._zod.def.when) {
                    const shouldRun = ch._zod.def.when(payload);
                    if (!shouldRun)
                        continue;
                }
                else if (isAborted) {
                    continue;
                }
                const currLen = payload.issues.length;
                const _ = ch._zod.check(payload);
                if (_ instanceof Promise && ctx?.async === false) {
                    throw new $ZodAsyncError();
                }
                if (asyncResult || _ instanceof Promise) {
                    asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
                        await _;
                        const nextLen = payload.issues.length;
                        if (nextLen === currLen)
                            return;
                        if (!isAborted)
                            isAborted = aborted(payload, currLen);
                    });
                }
                else {
                    const nextLen = payload.issues.length;
                    if (nextLen === currLen)
                        continue;
                    if (!isAborted)
                        isAborted = aborted(payload, currLen);
                }
            }
            if (asyncResult) {
                return asyncResult.then(() => {
                    return payload;
                });
            }
            return payload;
        };
        inst._zod.run = (payload, ctx) => {
            const result = inst._zod.parse(payload, ctx);
            if (result instanceof Promise) {
                if (ctx.async === false)
                    throw new $ZodAsyncError();
                return result.then((result) => runChecks(result, checks, ctx));
            }
            return runChecks(result, checks, ctx);
        };
    }
    inst["~standard"] = {
        validate: (value) => {
            try {
                const r = safeParse(inst, value);
                return r.success ? { value: r.data } : { issues: r.error?.issues };
            }
            catch (_) {
                return safeParseAsync(inst, value).then((r) => (r.success ? { value: r.data } : { issues: r.error?.issues }));
            }
        },
        vendor: "zod",
        version: 1,
    };
});
const $ZodString = /*@__PURE__*/ $constructor("$ZodString", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = [...(inst?._zod.bag?.patterns ?? [])].pop() ?? string$1(inst._zod.bag);
    inst._zod.parse = (payload, _) => {
        if (def.coerce)
            try {
                payload.value = String(payload.value);
            }
            catch (_) { }
        if (typeof payload.value === "string")
            return payload;
        payload.issues.push({
            expected: "string",
            code: "invalid_type",
            input: payload.value,
            inst,
        });
        return payload;
    };
});
const $ZodNumber = /*@__PURE__*/ $constructor("$ZodNumber", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = inst._zod.bag.pattern ?? number$1;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Number(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
            return payload;
        }
        const received = typeof input === "number"
            ? Number.isNaN(input)
                ? "NaN"
                : !Number.isFinite(input)
                    ? "Infinity"
                    : undefined
            : undefined;
        payload.issues.push({
            expected: "number",
            code: "invalid_type",
            input,
            inst,
            ...(received ? { received } : {}),
        });
        return payload;
    };
});
const $ZodBoolean = /*@__PURE__*/ $constructor("$ZodBoolean", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.pattern = boolean$1;
    inst._zod.parse = (payload, _ctx) => {
        if (def.coerce)
            try {
                payload.value = Boolean(payload.value);
            }
            catch (_) { }
        const input = payload.value;
        if (typeof input === "boolean")
            return payload;
        payload.issues.push({
            expected: "boolean",
            code: "invalid_type",
            input,
            inst,
        });
        return payload;
    };
});
function handleArrayResult(result, final, index) {
    if (result.issues.length) {
        final.issues.push(...prefixIssues(index, result.issues));
    }
    final.value[index] = result.value;
}
const $ZodArray = /*@__PURE__*/ $constructor("$ZodArray", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.parse = (payload, ctx) => {
        const input = payload.value;
        if (!Array.isArray(input)) {
            payload.issues.push({
                expected: "array",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        payload.value = Array(input.length);
        const proms = [];
        for (let i = 0; i < input.length; i++) {
            const item = input[i];
            const result = def.element._zod.run({
                value: item,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                proms.push(result.then((result) => handleArrayResult(result, payload, i)));
            }
            else {
                handleArrayResult(result, payload, i);
            }
        }
        if (proms.length) {
            return Promise.all(proms).then(() => payload);
        }
        return payload; //handleArrayResultsAsync(parseResults, final);
    };
});
function handleObjectResult(result, final, key) {
    // if(isOptional)
    if (result.issues.length) {
        final.issues.push(...prefixIssues(key, result.issues));
    }
    final.value[key] = result.value;
}
function handleOptionalObjectResult(result, final, key, input) {
    if (result.issues.length) {
        // validation failed against value schema
        if (input[key] === undefined) {
            // if input was undefined, ignore the error
            if (key in input) {
                final.value[key] = undefined;
            }
            else {
                final.value[key] = result.value;
            }
        }
        else {
            final.issues.push(...prefixIssues(key, result.issues));
        }
    }
    else if (result.value === undefined) {
        // validation returned `undefined`
        if (key in input)
            final.value[key] = undefined;
    }
    else {
        // non-undefined value
        final.value[key] = result.value;
    }
}
const $ZodObject = /*@__PURE__*/ $constructor("$ZodObject", (inst, def) => {
    // requires cast because technically $ZodObject doesn't extend
    $ZodType.init(inst, def);
    const _normalized = cached$1(() => {
        const keys = Object.keys(def.shape);
        for (const k of keys) {
            if (!(def.shape[k] instanceof $ZodType)) {
                throw new Error(`Invalid element at key "${k}": expected a Zod schema`);
            }
        }
        const okeys = optionalKeys(def.shape);
        return {
            shape: def.shape,
            keys,
            keySet: new Set(keys),
            numKeys: keys.length,
            optionalKeys: new Set(okeys),
        };
    });
    defineLazy(inst._zod, "propValues", () => {
        const shape = def.shape;
        const propValues = {};
        for (const key in shape) {
            const field = shape[key]._zod;
            if (field.values) {
                propValues[key] ?? (propValues[key] = new Set());
                for (const v of field.values)
                    propValues[key].add(v);
            }
        }
        return propValues;
    });
    const generateFastpass = (shape) => {
        const doc = new Doc(["shape", "payload", "ctx"]);
        const normalized = _normalized.value;
        const parseStr = (key) => {
            const k = esc(key);
            return `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
        };
        doc.write(`const input = payload.value;`);
        const ids = Object.create(null);
        let counter = 0;
        for (const key of normalized.keys) {
            ids[key] = `key_${counter++}`;
        }
        // A: preserve key order {
        doc.write(`const newResult = {}`);
        for (const key of normalized.keys) {
            if (normalized.optionalKeys.has(key)) {
                const id = ids[key];
                doc.write(`const ${id} = ${parseStr(key)};`);
                const k = esc(key);
                doc.write(`
        if (${id}.issues.length) {
          if (input[${k}] === undefined) {
            if (${k} in input) {
              newResult[${k}] = undefined;
            }
          } else {
            payload.issues = payload.issues.concat(
              ${id}.issues.map((iss) => ({
                ...iss,
                path: iss.path ? [${k}, ...iss.path] : [${k}],
              }))
            );
          }
        } else if (${id}.value === undefined) {
          if (${k} in input) newResult[${k}] = undefined;
        } else {
          newResult[${k}] = ${id}.value;
        }
        `);
            }
            else {
                const id = ids[key];
                //  const id = ids[key];
                doc.write(`const ${id} = ${parseStr(key)};`);
                doc.write(`
          if (${id}.issues.length) payload.issues = payload.issues.concat(${id}.issues.map(iss => ({
            ...iss,
            path: iss.path ? [${esc(key)}, ...iss.path] : [${esc(key)}]
          })));`);
                doc.write(`newResult[${esc(key)}] = ${id}.value`);
            }
        }
        doc.write(`payload.value = newResult;`);
        doc.write(`return payload;`);
        const fn = doc.compile();
        return (payload, ctx) => fn(shape, payload, ctx);
    };
    let fastpass;
    const isObject$1 = isObject;
    const jit = !globalConfig.jitless;
    const allowsEval$1 = allowsEval;
    const fastEnabled = jit && allowsEval$1.value; // && !def.catchall;
    const catchall = def.catchall;
    let value;
    inst._zod.parse = (payload, ctx) => {
        value ?? (value = _normalized.value);
        const input = payload.value;
        if (!isObject$1(input)) {
            payload.issues.push({
                expected: "object",
                code: "invalid_type",
                input,
                inst,
            });
            return payload;
        }
        const proms = [];
        if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
            // always synchronous
            if (!fastpass)
                fastpass = generateFastpass(def.shape);
            payload = fastpass(payload, ctx);
        }
        else {
            payload.value = {};
            const shape = value.shape;
            for (const key of value.keys) {
                const el = shape[key];
                // do not add omitted optional keys
                // if (!(key in input)) {
                //   if (optionalKeys.has(key)) continue;
                //   payload.issues.push({
                //     code: "invalid_type",
                //     path: [key],
                //     expected: "nonoptional",
                //     note: `Missing required key: "${key}"`,
                //     input,
                //     inst,
                //   });
                // }
                const r = el._zod.run({ value: input[key], issues: [] }, ctx);
                const isOptional = el._zod.optin === "optional" && el._zod.optout === "optional";
                if (r instanceof Promise) {
                    proms.push(r.then((r) => isOptional ? handleOptionalObjectResult(r, payload, key, input) : handleObjectResult(r, payload, key)));
                }
                else if (isOptional) {
                    handleOptionalObjectResult(r, payload, key, input);
                }
                else {
                    handleObjectResult(r, payload, key);
                }
            }
        }
        if (!catchall) {
            // return payload;
            return proms.length ? Promise.all(proms).then(() => payload) : payload;
        }
        const unrecognized = [];
        // iterate over input keys
        const keySet = value.keySet;
        const _catchall = catchall._zod;
        const t = _catchall.def.type;
        for (const key of Object.keys(input)) {
            if (keySet.has(key))
                continue;
            if (t === "never") {
                unrecognized.push(key);
                continue;
            }
            const r = _catchall.run({ value: input[key], issues: [] }, ctx);
            if (r instanceof Promise) {
                proms.push(r.then((r) => handleObjectResult(r, payload, key)));
            }
            else {
                handleObjectResult(r, payload, key);
            }
        }
        if (unrecognized.length) {
            payload.issues.push({
                code: "unrecognized_keys",
                keys: unrecognized,
                input,
                inst,
            });
        }
        if (!proms.length)
            return payload;
        return Promise.all(proms).then(() => {
            return payload;
        });
    };
});
function handleUnionResults(results, final, inst, ctx) {
    for (const result of results) {
        if (result.issues.length === 0) {
            final.value = result.value;
            return final;
        }
    }
    final.issues.push({
        code: "invalid_union",
        input: final.value,
        inst,
        errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config()))),
    });
    return final;
}
const $ZodUnion = /*@__PURE__*/ $constructor("$ZodUnion", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "optin", () => def.options.some((o) => o._zod.optin === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "optout", () => def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
    defineLazy(inst._zod, "values", () => {
        if (def.options.every((o) => o._zod.values)) {
            return new Set(def.options.flatMap((option) => Array.from(option._zod.values)));
        }
        return undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        if (def.options.every((o) => o._zod.pattern)) {
            const patterns = def.options.map((o) => o._zod.pattern);
            return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
        }
        return undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        let async = false;
        const results = [];
        for (const option of def.options) {
            const result = option._zod.run({
                value: payload.value,
                issues: [],
            }, ctx);
            if (result instanceof Promise) {
                results.push(result);
                async = true;
            }
            else {
                if (result.issues.length === 0)
                    return result;
                results.push(result);
            }
        }
        if (!async)
            return handleUnionResults(results, payload, inst, ctx);
        return Promise.all(results).then((results) => {
            return handleUnionResults(results, payload, inst, ctx);
        });
    };
});
const $ZodLiteral = /*@__PURE__*/ $constructor("$ZodLiteral", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.values = new Set(def.values);
    inst._zod.pattern = new RegExp(`^(${def.values
        .map((o) => (typeof o === "string" ? escapeRegex(o) : o ? o.toString() : String(o)))
        .join("|")})$`);
    inst._zod.parse = (payload, _ctx) => {
        const input = payload.value;
        if (inst._zod.values.has(input)) {
            return payload;
        }
        payload.issues.push({
            code: "invalid_value",
            values: def.values,
            input,
            inst,
        });
        return payload;
    };
});
const $ZodOptional = /*@__PURE__*/ $constructor("$ZodOptional", (inst, def) => {
    $ZodType.init(inst, def);
    inst._zod.optin = "optional";
    inst._zod.optout = "optional";
    defineLazy(inst._zod, "values", () => {
        return def.innerType._zod.values ? new Set([...def.innerType._zod.values, undefined]) : undefined;
    });
    defineLazy(inst._zod, "pattern", () => {
        const pattern = def.innerType._zod.pattern;
        return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
    });
    inst._zod.parse = (payload, ctx) => {
        if (def.innerType._zod.optin === "optional") {
            return def.innerType._zod.run(payload, ctx);
        }
        if (payload.value === undefined) {
            return payload;
        }
        return def.innerType._zod.run(payload, ctx);
    };
});
const $ZodLazy = /*@__PURE__*/ $constructor("$ZodLazy", (inst, def) => {
    $ZodType.init(inst, def);
    defineLazy(inst._zod, "innerType", () => def.getter());
    defineLazy(inst._zod, "pattern", () => inst._zod.innerType._zod.pattern);
    defineLazy(inst._zod, "propValues", () => inst._zod.innerType._zod.propValues);
    defineLazy(inst._zod, "optin", () => inst._zod.innerType._zod.optin);
    defineLazy(inst._zod, "optout", () => inst._zod.innerType._zod.optout);
    inst._zod.parse = (payload, ctx) => {
        const inner = inst._zod.innerType;
        return inner._zod.run(payload, ctx);
    };
});

function _string(Class, params) {
    return new Class({
        type: "string",
        ...normalizeParams(),
    });
}
function _number(Class, params) {
    return new Class({
        type: "number",
        checks: [],
        ...normalizeParams(),
    });
}
function _boolean(Class, params) {
    return new Class({
        type: "boolean",
        ...normalizeParams(),
    });
}

const ZodMiniType = /*@__PURE__*/ $constructor("ZodMiniType", (inst, def) => {
    if (!inst._zod)
        throw new Error("Uninitialized schema in ZodMiniType.");
    $ZodType.init(inst, def);
    inst.def = def;
    inst.parse = (data, params) => parse(inst, data, params, { callee: inst.parse });
    inst.safeParse = (data, params) => safeParse(inst, data, params);
    inst.parseAsync = async (data, params) => parseAsync(inst, data, params, { callee: inst.parseAsync });
    inst.safeParseAsync = async (data, params) => safeParseAsync(inst, data, params);
    inst.check = (...checks) => {
        return inst.clone({
            ...def,
            checks: [
                ...(def.checks ?? []),
                ...checks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch),
            ],
        }
        // { parent: true }
        );
    };
    inst.clone = (_def, params) => clone(inst, _def, params);
    inst.brand = () => inst;
    inst.register = ((reg, meta) => {
        reg.add(inst, meta);
        return inst;
    });
});
const ZodMiniString = /*@__PURE__*/ $constructor("ZodMiniString", (inst, def) => {
    $ZodString.init(inst, def);
    ZodMiniType.init(inst, def);
});
function string(params) {
    return _string(ZodMiniString);
}
const ZodMiniNumber = /*@__PURE__*/ $constructor("ZodMiniNumber", (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodMiniType.init(inst, def);
});
function number(params) {
    return _number(ZodMiniNumber);
}
const ZodMiniBoolean = /*@__PURE__*/ $constructor("ZodMiniBoolean", (inst, def) => {
    $ZodBoolean.init(inst, def);
    ZodMiniType.init(inst, def);
});
function boolean(params) {
    return _boolean(ZodMiniBoolean);
}
const ZodMiniArray = /*@__PURE__*/ $constructor("ZodMiniArray", (inst, def) => {
    $ZodArray.init(inst, def);
    ZodMiniType.init(inst, def);
});
function array(element, params) {
    return new ZodMiniArray({
        type: "array",
        element: element,
        ...normalizeParams(),
    });
}
const ZodMiniObject = /*@__PURE__*/ $constructor("ZodMiniObject", (inst, def) => {
    $ZodObject.init(inst, def);
    ZodMiniType.init(inst, def);
    defineLazy(inst, "shape", () => def.shape);
});
function object(shape, params) {
    const def = {
        type: "object",
        get shape() {
            assignProp(this, "shape", { ...shape });
            return this.shape;
        },
        ...normalizeParams(),
    };
    return new ZodMiniObject(def);
}
const ZodMiniUnion = /*@__PURE__*/ $constructor("ZodMiniUnion", (inst, def) => {
    $ZodUnion.init(inst, def);
    ZodMiniType.init(inst, def);
});
function union(options, params) {
    return new ZodMiniUnion({
        type: "union",
        options: options,
        ...normalizeParams(),
    });
}
const ZodMiniLiteral = /*@__PURE__*/ $constructor("ZodMiniLiteral", (inst, def) => {
    $ZodLiteral.init(inst, def);
    ZodMiniType.init(inst, def);
});
function literal(value, params) {
    return new ZodMiniLiteral({
        type: "literal",
        values: Array.isArray(value) ? value : [value],
        ...normalizeParams(),
    });
}
const ZodMiniOptional = /*@__PURE__*/ $constructor("ZodMiniOptional", (inst, def) => {
    $ZodOptional.init(inst, def);
    ZodMiniType.init(inst, def);
});
function optional(innerType) {
    return new ZodMiniOptional({
        type: "optional",
        innerType: innerType,
    });
}
const ZodMiniLazy = /*@__PURE__*/ $constructor("ZodMiniLazy", (inst, def) => {
    $ZodLazy.init(inst, def);
    ZodMiniType.init(inst, def);
});
// export function lazy<T extends object>(getter: () => T): T {
//   return util.createTransparentProxy<T>(getter);
// }
function _lazy(getter) {
    return new ZodMiniLazy({
        type: "lazy",
        getter: getter,
    });
}

/**
 * Serializable structure that represents an option.
 */
const Option = object({
    type: literal("option"),
    disabled: optional(boolean()),
    label: string(),
    value: union([boolean(), number(), string()]),
});

/**
 * Serializable structure that represents a group of options.
 */
const OptionGroup = object({
    type: literal("option-group"),
    disabled: optional(boolean()),
    options: _lazy(() => array(union([Option, OptionGroup]))),
    label: string(),
});

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var bufferUtil = {exports: {}};

var constants;
var hasRequiredConstants;

function requireConstants () {
	if (hasRequiredConstants) return constants;
	hasRequiredConstants = 1;

	const BINARY_TYPES = ['nodebuffer', 'arraybuffer', 'fragments'];
	const hasBlob = typeof Blob !== 'undefined';

	if (hasBlob) BINARY_TYPES.push('blob');

	constants = {
	  BINARY_TYPES,
	  CLOSE_TIMEOUT: 30000,
	  EMPTY_BUFFER: Buffer.alloc(0),
	  GUID: '258EAFA5-E914-47DA-95CA-C5AB0DC85B11',
	  hasBlob,
	  kForOnEventAttribute: Symbol('kIsForOnEventAttribute'),
	  kListener: Symbol('kListener'),
	  kStatusCode: Symbol('status-code'),
	  kWebSocket: Symbol('websocket'),
	  NOOP: () => {}
	};
	return constants;
}

var hasRequiredBufferUtil;

function requireBufferUtil () {
	if (hasRequiredBufferUtil) return bufferUtil.exports;
	hasRequiredBufferUtil = 1;

	const { EMPTY_BUFFER } = requireConstants();

	const FastBuffer = Buffer[Symbol.species];

	/**
	 * Merges an array of buffers into a new buffer.
	 *
	 * @param {Buffer[]} list The array of buffers to concat
	 * @param {Number} totalLength The total length of buffers in the list
	 * @return {Buffer} The resulting buffer
	 * @public
	 */
	function concat(list, totalLength) {
	  if (list.length === 0) return EMPTY_BUFFER;
	  if (list.length === 1) return list[0];

	  const target = Buffer.allocUnsafe(totalLength);
	  let offset = 0;

	  for (let i = 0; i < list.length; i++) {
	    const buf = list[i];
	    target.set(buf, offset);
	    offset += buf.length;
	  }

	  if (offset < totalLength) {
	    return new FastBuffer(target.buffer, target.byteOffset, offset);
	  }

	  return target;
	}

	/**
	 * Masks a buffer using the given mask.
	 *
	 * @param {Buffer} source The buffer to mask
	 * @param {Buffer} mask The mask to use
	 * @param {Buffer} output The buffer where to store the result
	 * @param {Number} offset The offset at which to start writing
	 * @param {Number} length The number of bytes to mask.
	 * @public
	 */
	function _mask(source, mask, output, offset, length) {
	  for (let i = 0; i < length; i++) {
	    output[offset + i] = source[i] ^ mask[i & 3];
	  }
	}

	/**
	 * Unmasks a buffer using the given mask.
	 *
	 * @param {Buffer} buffer The buffer to unmask
	 * @param {Buffer} mask The mask to use
	 * @public
	 */
	function _unmask(buffer, mask) {
	  for (let i = 0; i < buffer.length; i++) {
	    buffer[i] ^= mask[i & 3];
	  }
	}

	/**
	 * Converts a buffer to an `ArrayBuffer`.
	 *
	 * @param {Buffer} buf The buffer to convert
	 * @return {ArrayBuffer} Converted buffer
	 * @public
	 */
	function toArrayBuffer(buf) {
	  if (buf.length === buf.buffer.byteLength) {
	    return buf.buffer;
	  }

	  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
	}

	/**
	 * Converts `data` to a `Buffer`.
	 *
	 * @param {*} data The data to convert
	 * @return {Buffer} The buffer
	 * @throws {TypeError}
	 * @public
	 */
	function toBuffer(data) {
	  toBuffer.readOnly = true;

	  if (Buffer.isBuffer(data)) return data;

	  let buf;

	  if (data instanceof ArrayBuffer) {
	    buf = new FastBuffer(data);
	  } else if (ArrayBuffer.isView(data)) {
	    buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
	  } else {
	    buf = Buffer.from(data);
	    toBuffer.readOnly = false;
	  }

	  return buf;
	}

	bufferUtil.exports = {
	  concat,
	  mask: _mask,
	  toArrayBuffer,
	  toBuffer,
	  unmask: _unmask
	};

	/* istanbul ignore else  */
	if (!process.env.WS_NO_BUFFER_UTIL) {
	  try {
	    const bufferUtil$1 = require('bufferutil');

	    bufferUtil.exports.mask = function (source, mask, output, offset, length) {
	      if (length < 48) _mask(source, mask, output, offset, length);
	      else bufferUtil$1.mask(source, mask, output, offset, length);
	    };

	    bufferUtil.exports.unmask = function (buffer, mask) {
	      if (buffer.length < 32) _unmask(buffer, mask);
	      else bufferUtil$1.unmask(buffer, mask);
	    };
	  } catch (e) {
	    // Continue regardless of the error.
	  }
	}
	return bufferUtil.exports;
}

var limiter;
var hasRequiredLimiter;

function requireLimiter () {
	if (hasRequiredLimiter) return limiter;
	hasRequiredLimiter = 1;

	const kDone = Symbol('kDone');
	const kRun = Symbol('kRun');

	/**
	 * A very simple job queue with adjustable concurrency. Adapted from
	 * https://github.com/STRML/async-limiter
	 */
	class Limiter {
	  /**
	   * Creates a new `Limiter`.
	   *
	   * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
	   *     to run concurrently
	   */
	  constructor(concurrency) {
	    this[kDone] = () => {
	      this.pending--;
	      this[kRun]();
	    };
	    this.concurrency = concurrency || Infinity;
	    this.jobs = [];
	    this.pending = 0;
	  }

	  /**
	   * Adds a job to the queue.
	   *
	   * @param {Function} job The job to run
	   * @public
	   */
	  add(job) {
	    this.jobs.push(job);
	    this[kRun]();
	  }

	  /**
	   * Removes a job from the queue and runs it if possible.
	   *
	   * @private
	   */
	  [kRun]() {
	    if (this.pending === this.concurrency) return;

	    if (this.jobs.length) {
	      const job = this.jobs.shift();

	      this.pending++;
	      job(this[kDone]);
	    }
	  }
	}

	limiter = Limiter;
	return limiter;
}

var permessageDeflate;
var hasRequiredPermessageDeflate;

function requirePermessageDeflate () {
	if (hasRequiredPermessageDeflate) return permessageDeflate;
	hasRequiredPermessageDeflate = 1;

	const zlib = require$$0;

	const bufferUtil = requireBufferUtil();
	const Limiter = requireLimiter();
	const { kStatusCode } = requireConstants();

	const FastBuffer = Buffer[Symbol.species];
	const TRAILER = Buffer.from([0x00, 0x00, 0xff, 0xff]);
	const kPerMessageDeflate = Symbol('permessage-deflate');
	const kTotalLength = Symbol('total-length');
	const kCallback = Symbol('callback');
	const kBuffers = Symbol('buffers');
	const kError = Symbol('error');

	//
	// We limit zlib concurrency, which prevents severe memory fragmentation
	// as documented in https://github.com/nodejs/node/issues/8871#issuecomment-250915913
	// and https://github.com/websockets/ws/issues/1202
	//
	// Intentionally global; it's the global thread pool that's an issue.
	//
	let zlibLimiter;

	/**
	 * permessage-deflate implementation.
	 */
	class PerMessageDeflate {
	  /**
	   * Creates a PerMessageDeflate instance.
	   *
	   * @param {Object} [options] Configuration options
	   * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
	   *     for, or request, a custom client window size
	   * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
	   *     acknowledge disabling of client context takeover
	   * @param {Number} [options.concurrencyLimit=10] The number of concurrent
	   *     calls to zlib
	   * @param {Boolean} [options.isServer=false] Create the instance in either
	   *     server or client mode
	   * @param {Number} [options.maxPayload=0] The maximum allowed message length
	   * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
	   *     use of a custom server window size
	   * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
	   *     disabling of server context takeover
	   * @param {Number} [options.threshold=1024] Size (in bytes) below which
	   *     messages should not be compressed if context takeover is disabled
	   * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
	   *     deflate
	   * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
	   *     inflate
	   */
	  constructor(options) {
	    this._options = options || {};
	    this._threshold =
	      this._options.threshold !== undefined ? this._options.threshold : 1024;
	    this._maxPayload = this._options.maxPayload | 0;
	    this._isServer = !!this._options.isServer;
	    this._deflate = null;
	    this._inflate = null;

	    this.params = null;

	    if (!zlibLimiter) {
	      const concurrency =
	        this._options.concurrencyLimit !== undefined
	          ? this._options.concurrencyLimit
	          : 10;
	      zlibLimiter = new Limiter(concurrency);
	    }
	  }

	  /**
	   * @type {String}
	   */
	  static get extensionName() {
	    return 'permessage-deflate';
	  }

	  /**
	   * Create an extension negotiation offer.
	   *
	   * @return {Object} Extension parameters
	   * @public
	   */
	  offer() {
	    const params = {};

	    if (this._options.serverNoContextTakeover) {
	      params.server_no_context_takeover = true;
	    }
	    if (this._options.clientNoContextTakeover) {
	      params.client_no_context_takeover = true;
	    }
	    if (this._options.serverMaxWindowBits) {
	      params.server_max_window_bits = this._options.serverMaxWindowBits;
	    }
	    if (this._options.clientMaxWindowBits) {
	      params.client_max_window_bits = this._options.clientMaxWindowBits;
	    } else if (this._options.clientMaxWindowBits == null) {
	      params.client_max_window_bits = true;
	    }

	    return params;
	  }

	  /**
	   * Accept an extension negotiation offer/response.
	   *
	   * @param {Array} configurations The extension negotiation offers/reponse
	   * @return {Object} Accepted configuration
	   * @public
	   */
	  accept(configurations) {
	    configurations = this.normalizeParams(configurations);

	    this.params = this._isServer
	      ? this.acceptAsServer(configurations)
	      : this.acceptAsClient(configurations);

	    return this.params;
	  }

	  /**
	   * Releases all resources used by the extension.
	   *
	   * @public
	   */
	  cleanup() {
	    if (this._inflate) {
	      this._inflate.close();
	      this._inflate = null;
	    }

	    if (this._deflate) {
	      const callback = this._deflate[kCallback];

	      this._deflate.close();
	      this._deflate = null;

	      if (callback) {
	        callback(
	          new Error(
	            'The deflate stream was closed while data was being processed'
	          )
	        );
	      }
	    }
	  }

	  /**
	   *  Accept an extension negotiation offer.
	   *
	   * @param {Array} offers The extension negotiation offers
	   * @return {Object} Accepted configuration
	   * @private
	   */
	  acceptAsServer(offers) {
	    const opts = this._options;
	    const accepted = offers.find((params) => {
	      if (
	        (opts.serverNoContextTakeover === false &&
	          params.server_no_context_takeover) ||
	        (params.server_max_window_bits &&
	          (opts.serverMaxWindowBits === false ||
	            (typeof opts.serverMaxWindowBits === 'number' &&
	              opts.serverMaxWindowBits > params.server_max_window_bits))) ||
	        (typeof opts.clientMaxWindowBits === 'number' &&
	          !params.client_max_window_bits)
	      ) {
	        return false;
	      }

	      return true;
	    });

	    if (!accepted) {
	      throw new Error('None of the extension offers can be accepted');
	    }

	    if (opts.serverNoContextTakeover) {
	      accepted.server_no_context_takeover = true;
	    }
	    if (opts.clientNoContextTakeover) {
	      accepted.client_no_context_takeover = true;
	    }
	    if (typeof opts.serverMaxWindowBits === 'number') {
	      accepted.server_max_window_bits = opts.serverMaxWindowBits;
	    }
	    if (typeof opts.clientMaxWindowBits === 'number') {
	      accepted.client_max_window_bits = opts.clientMaxWindowBits;
	    } else if (
	      accepted.client_max_window_bits === true ||
	      opts.clientMaxWindowBits === false
	    ) {
	      delete accepted.client_max_window_bits;
	    }

	    return accepted;
	  }

	  /**
	   * Accept the extension negotiation response.
	   *
	   * @param {Array} response The extension negotiation response
	   * @return {Object} Accepted configuration
	   * @private
	   */
	  acceptAsClient(response) {
	    const params = response[0];

	    if (
	      this._options.clientNoContextTakeover === false &&
	      params.client_no_context_takeover
	    ) {
	      throw new Error('Unexpected parameter "client_no_context_takeover"');
	    }

	    if (!params.client_max_window_bits) {
	      if (typeof this._options.clientMaxWindowBits === 'number') {
	        params.client_max_window_bits = this._options.clientMaxWindowBits;
	      }
	    } else if (
	      this._options.clientMaxWindowBits === false ||
	      (typeof this._options.clientMaxWindowBits === 'number' &&
	        params.client_max_window_bits > this._options.clientMaxWindowBits)
	    ) {
	      throw new Error(
	        'Unexpected or invalid parameter "client_max_window_bits"'
	      );
	    }

	    return params;
	  }

	  /**
	   * Normalize parameters.
	   *
	   * @param {Array} configurations The extension negotiation offers/reponse
	   * @return {Array} The offers/response with normalized parameters
	   * @private
	   */
	  normalizeParams(configurations) {
	    configurations.forEach((params) => {
	      Object.keys(params).forEach((key) => {
	        let value = params[key];

	        if (value.length > 1) {
	          throw new Error(`Parameter "${key}" must have only a single value`);
	        }

	        value = value[0];

	        if (key === 'client_max_window_bits') {
	          if (value !== true) {
	            const num = +value;
	            if (!Number.isInteger(num) || num < 8 || num > 15) {
	              throw new TypeError(
	                `Invalid value for parameter "${key}": ${value}`
	              );
	            }
	            value = num;
	          } else if (!this._isServer) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	        } else if (key === 'server_max_window_bits') {
	          const num = +value;
	          if (!Number.isInteger(num) || num < 8 || num > 15) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	          value = num;
	        } else if (
	          key === 'client_no_context_takeover' ||
	          key === 'server_no_context_takeover'
	        ) {
	          if (value !== true) {
	            throw new TypeError(
	              `Invalid value for parameter "${key}": ${value}`
	            );
	          }
	        } else {
	          throw new Error(`Unknown parameter "${key}"`);
	        }

	        params[key] = value;
	      });
	    });

	    return configurations;
	  }

	  /**
	   * Decompress data. Concurrency limited.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @public
	   */
	  decompress(data, fin, callback) {
	    zlibLimiter.add((done) => {
	      this._decompress(data, fin, (err, result) => {
	        done();
	        callback(err, result);
	      });
	    });
	  }

	  /**
	   * Compress data. Concurrency limited.
	   *
	   * @param {(Buffer|String)} data Data to compress
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @public
	   */
	  compress(data, fin, callback) {
	    zlibLimiter.add((done) => {
	      this._compress(data, fin, (err, result) => {
	        done();
	        callback(err, result);
	      });
	    });
	  }

	  /**
	   * Decompress data.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @private
	   */
	  _decompress(data, fin, callback) {
	    const endpoint = this._isServer ? 'client' : 'server';

	    if (!this._inflate) {
	      const key = `${endpoint}_max_window_bits`;
	      const windowBits =
	        typeof this.params[key] !== 'number'
	          ? zlib.Z_DEFAULT_WINDOWBITS
	          : this.params[key];

	      this._inflate = zlib.createInflateRaw({
	        ...this._options.zlibInflateOptions,
	        windowBits
	      });
	      this._inflate[kPerMessageDeflate] = this;
	      this._inflate[kTotalLength] = 0;
	      this._inflate[kBuffers] = [];
	      this._inflate.on('error', inflateOnError);
	      this._inflate.on('data', inflateOnData);
	    }

	    this._inflate[kCallback] = callback;

	    this._inflate.write(data);
	    if (fin) this._inflate.write(TRAILER);

	    this._inflate.flush(() => {
	      const err = this._inflate[kError];

	      if (err) {
	        this._inflate.close();
	        this._inflate = null;
	        callback(err);
	        return;
	      }

	      const data = bufferUtil.concat(
	        this._inflate[kBuffers],
	        this._inflate[kTotalLength]
	      );

	      if (this._inflate._readableState.endEmitted) {
	        this._inflate.close();
	        this._inflate = null;
	      } else {
	        this._inflate[kTotalLength] = 0;
	        this._inflate[kBuffers] = [];

	        if (fin && this.params[`${endpoint}_no_context_takeover`]) {
	          this._inflate.reset();
	        }
	      }

	      callback(null, data);
	    });
	  }

	  /**
	   * Compress data.
	   *
	   * @param {(Buffer|String)} data Data to compress
	   * @param {Boolean} fin Specifies whether or not this is the last fragment
	   * @param {Function} callback Callback
	   * @private
	   */
	  _compress(data, fin, callback) {
	    const endpoint = this._isServer ? 'server' : 'client';

	    if (!this._deflate) {
	      const key = `${endpoint}_max_window_bits`;
	      const windowBits =
	        typeof this.params[key] !== 'number'
	          ? zlib.Z_DEFAULT_WINDOWBITS
	          : this.params[key];

	      this._deflate = zlib.createDeflateRaw({
	        ...this._options.zlibDeflateOptions,
	        windowBits
	      });

	      this._deflate[kTotalLength] = 0;
	      this._deflate[kBuffers] = [];

	      this._deflate.on('data', deflateOnData);
	    }

	    this._deflate[kCallback] = callback;

	    this._deflate.write(data);
	    this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
	      if (!this._deflate) {
	        //
	        // The deflate stream was closed while data was being processed.
	        //
	        return;
	      }

	      let data = bufferUtil.concat(
	        this._deflate[kBuffers],
	        this._deflate[kTotalLength]
	      );

	      if (fin) {
	        data = new FastBuffer(data.buffer, data.byteOffset, data.length - 4);
	      }

	      //
	      // Ensure that the callback will not be called again in
	      // `PerMessageDeflate#cleanup()`.
	      //
	      this._deflate[kCallback] = null;

	      this._deflate[kTotalLength] = 0;
	      this._deflate[kBuffers] = [];

	      if (fin && this.params[`${endpoint}_no_context_takeover`]) {
	        this._deflate.reset();
	      }

	      callback(null, data);
	    });
	  }
	}

	permessageDeflate = PerMessageDeflate;

	/**
	 * The listener of the `zlib.DeflateRaw` stream `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function deflateOnData(chunk) {
	  this[kBuffers].push(chunk);
	  this[kTotalLength] += chunk.length;
	}

	/**
	 * The listener of the `zlib.InflateRaw` stream `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function inflateOnData(chunk) {
	  this[kTotalLength] += chunk.length;

	  if (
	    this[kPerMessageDeflate]._maxPayload < 1 ||
	    this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload
	  ) {
	    this[kBuffers].push(chunk);
	    return;
	  }

	  this[kError] = new RangeError('Max payload size exceeded');
	  this[kError].code = 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
	  this[kError][kStatusCode] = 1009;
	  this.removeListener('data', inflateOnData);

	  //
	  // The choice to employ `zlib.reset()` over `zlib.close()` is dictated by the
	  // fact that in Node.js versions prior to 13.10.0, the callback for
	  // `zlib.flush()` is not called if `zlib.close()` is used. Utilizing
	  // `zlib.reset()` ensures that either the callback is invoked or an error is
	  // emitted.
	  //
	  this.reset();
	}

	/**
	 * The listener of the `zlib.InflateRaw` stream `'error'` event.
	 *
	 * @param {Error} err The emitted error
	 * @private
	 */
	function inflateOnError(err) {
	  //
	  // There is no need to call `Zlib#close()` as the handle is automatically
	  // closed when an error is emitted.
	  //
	  this[kPerMessageDeflate]._inflate = null;

	  if (this[kError]) {
	    this[kCallback](this[kError]);
	    return;
	  }

	  err[kStatusCode] = 1007;
	  this[kCallback](err);
	}
	return permessageDeflate;
}

var validation = {exports: {}};

var hasRequiredValidation;

function requireValidation () {
	if (hasRequiredValidation) return validation.exports;
	hasRequiredValidation = 1;

	const { isUtf8 } = require$$0$1;

	const { hasBlob } = requireConstants();

	//
	// Allowed token characters:
	//
	// '!', '#', '$', '%', '&', ''', '*', '+', '-',
	// '.', 0-9, A-Z, '^', '_', '`', a-z, '|', '~'
	//
	// tokenChars[32] === 0 // ' '
	// tokenChars[33] === 1 // '!'
	// tokenChars[34] === 0 // '"'
	// ...
	//
	// prettier-ignore
	const tokenChars = [
	  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 0 - 15
	  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // 16 - 31
	  0, 1, 0, 1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 1, 1, 0, // 32 - 47
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, // 48 - 63
	  0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 64 - 79
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 1, 1, // 80 - 95
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, // 96 - 111
	  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1, 0, 1, 0 // 112 - 127
	];

	/**
	 * Checks if a status code is allowed in a close frame.
	 *
	 * @param {Number} code The status code
	 * @return {Boolean} `true` if the status code is valid, else `false`
	 * @public
	 */
	function isValidStatusCode(code) {
	  return (
	    (code >= 1000 &&
	      code <= 1014 &&
	      code !== 1004 &&
	      code !== 1005 &&
	      code !== 1006) ||
	    (code >= 3000 && code <= 4999)
	  );
	}

	/**
	 * Checks if a given buffer contains only correct UTF-8.
	 * Ported from https://www.cl.cam.ac.uk/%7Emgk25/ucs/utf8_check.c by
	 * Markus Kuhn.
	 *
	 * @param {Buffer} buf The buffer to check
	 * @return {Boolean} `true` if `buf` contains only correct UTF-8, else `false`
	 * @public
	 */
	function _isValidUTF8(buf) {
	  const len = buf.length;
	  let i = 0;

	  while (i < len) {
	    if ((buf[i] & 0x80) === 0) {
	      // 0xxxxxxx
	      i++;
	    } else if ((buf[i] & 0xe0) === 0xc0) {
	      // 110xxxxx 10xxxxxx
	      if (
	        i + 1 === len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i] & 0xfe) === 0xc0 // Overlong
	      ) {
	        return false;
	      }

	      i += 2;
	    } else if ((buf[i] & 0xf0) === 0xe0) {
	      // 1110xxxx 10xxxxxx 10xxxxxx
	      if (
	        i + 2 >= len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i + 2] & 0xc0) !== 0x80 ||
	        (buf[i] === 0xe0 && (buf[i + 1] & 0xe0) === 0x80) || // Overlong
	        (buf[i] === 0xed && (buf[i + 1] & 0xe0) === 0xa0) // Surrogate (U+D800 - U+DFFF)
	      ) {
	        return false;
	      }

	      i += 3;
	    } else if ((buf[i] & 0xf8) === 0xf0) {
	      // 11110xxx 10xxxxxx 10xxxxxx 10xxxxxx
	      if (
	        i + 3 >= len ||
	        (buf[i + 1] & 0xc0) !== 0x80 ||
	        (buf[i + 2] & 0xc0) !== 0x80 ||
	        (buf[i + 3] & 0xc0) !== 0x80 ||
	        (buf[i] === 0xf0 && (buf[i + 1] & 0xf0) === 0x80) || // Overlong
	        (buf[i] === 0xf4 && buf[i + 1] > 0x8f) ||
	        buf[i] > 0xf4 // > U+10FFFF
	      ) {
	        return false;
	      }

	      i += 4;
	    } else {
	      return false;
	    }
	  }

	  return true;
	}

	/**
	 * Determines whether a value is a `Blob`.
	 *
	 * @param {*} value The value to be tested
	 * @return {Boolean} `true` if `value` is a `Blob`, else `false`
	 * @private
	 */
	function isBlob(value) {
	  return (
	    hasBlob &&
	    typeof value === 'object' &&
	    typeof value.arrayBuffer === 'function' &&
	    typeof value.type === 'string' &&
	    typeof value.stream === 'function' &&
	    (value[Symbol.toStringTag] === 'Blob' ||
	      value[Symbol.toStringTag] === 'File')
	  );
	}

	validation.exports = {
	  isBlob,
	  isValidStatusCode,
	  isValidUTF8: _isValidUTF8,
	  tokenChars
	};

	if (isUtf8) {
	  validation.exports.isValidUTF8 = function (buf) {
	    return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
	  };
	} /* istanbul ignore else  */ else if (!process.env.WS_NO_UTF_8_VALIDATE) {
	  try {
	    const isValidUTF8 = require('utf-8-validate');

	    validation.exports.isValidUTF8 = function (buf) {
	      return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
	    };
	  } catch (e) {
	    // Continue regardless of the error.
	  }
	}
	return validation.exports;
}

var receiver;
var hasRequiredReceiver;

function requireReceiver () {
	if (hasRequiredReceiver) return receiver;
	hasRequiredReceiver = 1;

	const { Writable } = require$$0$2;

	const PerMessageDeflate = requirePermessageDeflate();
	const {
	  BINARY_TYPES,
	  EMPTY_BUFFER,
	  kStatusCode,
	  kWebSocket
	} = requireConstants();
	const { concat, toArrayBuffer, unmask } = requireBufferUtil();
	const { isValidStatusCode, isValidUTF8 } = requireValidation();

	const FastBuffer = Buffer[Symbol.species];

	const GET_INFO = 0;
	const GET_PAYLOAD_LENGTH_16 = 1;
	const GET_PAYLOAD_LENGTH_64 = 2;
	const GET_MASK = 3;
	const GET_DATA = 4;
	const INFLATING = 5;
	const DEFER_EVENT = 6;

	/**
	 * HyBi Receiver implementation.
	 *
	 * @extends Writable
	 */
	class Receiver extends Writable {
	  /**
	   * Creates a Receiver instance.
	   *
	   * @param {Object} [options] Options object
	   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {String} [options.binaryType=nodebuffer] The type for binary data
	   * @param {Object} [options.extensions] An object containing the negotiated
	   *     extensions
	   * @param {Boolean} [options.isServer=false] Specifies whether to operate in
	   *     client or server mode
	   * @param {Number} [options.maxBufferedChunks=0] The maximum number of
	   *     buffered data chunks
	   * @param {Number} [options.maxFragments=0] The maximum number of message
	   *     fragments
	   * @param {Number} [options.maxPayload=0] The maximum allowed message length
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   */
	  constructor(options = {}) {
	    super();

	    this._allowSynchronousEvents =
	      options.allowSynchronousEvents !== undefined
	        ? options.allowSynchronousEvents
	        : true;
	    this._binaryType = options.binaryType || BINARY_TYPES[0];
	    this._extensions = options.extensions || {};
	    this._isServer = !!options.isServer;
	    this._maxBufferedChunks = options.maxBufferedChunks | 0;
	    this._maxFragments = options.maxFragments | 0;
	    this._maxPayload = options.maxPayload | 0;
	    this._skipUTF8Validation = !!options.skipUTF8Validation;
	    this[kWebSocket] = undefined;

	    this._bufferedBytes = 0;
	    this._buffers = [];

	    this._compressed = false;
	    this._payloadLength = 0;
	    this._mask = undefined;
	    this._fragmented = 0;
	    this._masked = false;
	    this._fin = false;
	    this._opcode = 0;

	    this._totalPayloadLength = 0;
	    this._messageLength = 0;
	    this._numFragments = 0;
	    this._fragments = [];

	    this._errored = false;
	    this._loop = false;
	    this._state = GET_INFO;
	  }

	  /**
	   * Implements `Writable.prototype._write()`.
	   *
	   * @param {Buffer} chunk The chunk of data to write
	   * @param {String} encoding The character encoding of `chunk`
	   * @param {Function} cb Callback
	   * @private
	   */
	  _write(chunk, encoding, cb) {
	    if (this._opcode === 0x08 && this._state == GET_INFO) return cb();

	    if (
	      this._maxBufferedChunks > 0 &&
	      this._buffers.length >= this._maxBufferedChunks
	    ) {
	      cb(
	        this.createError(
	          RangeError,
	          'Too many buffered chunks',
	          false,
	          1008,
	          'WS_ERR_TOO_MANY_BUFFERED_PARTS'
	        )
	      );
	      return;
	    }

	    this._bufferedBytes += chunk.length;
	    this._buffers.push(chunk);
	    this.startLoop(cb);
	  }

	  /**
	   * Consumes `n` bytes from the buffered data.
	   *
	   * @param {Number} n The number of bytes to consume
	   * @return {Buffer} The consumed bytes
	   * @private
	   */
	  consume(n) {
	    this._bufferedBytes -= n;

	    if (n === this._buffers[0].length) return this._buffers.shift();

	    if (n < this._buffers[0].length) {
	      const buf = this._buffers[0];
	      this._buffers[0] = new FastBuffer(
	        buf.buffer,
	        buf.byteOffset + n,
	        buf.length - n
	      );

	      return new FastBuffer(buf.buffer, buf.byteOffset, n);
	    }

	    const dst = Buffer.allocUnsafe(n);

	    do {
	      const buf = this._buffers[0];
	      const offset = dst.length - n;

	      if (n >= buf.length) {
	        dst.set(this._buffers.shift(), offset);
	      } else {
	        dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
	        this._buffers[0] = new FastBuffer(
	          buf.buffer,
	          buf.byteOffset + n,
	          buf.length - n
	        );
	      }

	      n -= buf.length;
	    } while (n > 0);

	    return dst;
	  }

	  /**
	   * Starts the parsing loop.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  startLoop(cb) {
	    this._loop = true;

	    do {
	      switch (this._state) {
	        case GET_INFO:
	          this.getInfo(cb);
	          break;
	        case GET_PAYLOAD_LENGTH_16:
	          this.getPayloadLength16(cb);
	          break;
	        case GET_PAYLOAD_LENGTH_64:
	          this.getPayloadLength64(cb);
	          break;
	        case GET_MASK:
	          this.getMask();
	          break;
	        case GET_DATA:
	          this.getData(cb);
	          break;
	        case INFLATING:
	        case DEFER_EVENT:
	          this._loop = false;
	          return;
	      }
	    } while (this._loop);

	    if (!this._errored) cb();
	  }

	  /**
	   * Reads the first two bytes of a frame.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getInfo(cb) {
	    if (this._bufferedBytes < 2) {
	      this._loop = false;
	      return;
	    }

	    const buf = this.consume(2);

	    if ((buf[0] & 0x30) !== 0x00) {
	      const error = this.createError(
	        RangeError,
	        'RSV2 and RSV3 must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_RSV_2_3'
	      );

	      cb(error);
	      return;
	    }

	    const compressed = (buf[0] & 0x40) === 0x40;

	    if (compressed && !this._extensions[PerMessageDeflate.extensionName]) {
	      const error = this.createError(
	        RangeError,
	        'RSV1 must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_RSV_1'
	      );

	      cb(error);
	      return;
	    }

	    this._fin = (buf[0] & 0x80) === 0x80;
	    this._opcode = buf[0] & 0x0f;
	    this._payloadLength = buf[1] & 0x7f;

	    if (this._opcode === 0x00) {
	      if (compressed) {
	        const error = this.createError(
	          RangeError,
	          'RSV1 must be clear',
	          true,
	          1002,
	          'WS_ERR_UNEXPECTED_RSV_1'
	        );

	        cb(error);
	        return;
	      }

	      if (!this._fragmented) {
	        const error = this.createError(
	          RangeError,
	          'invalid opcode 0',
	          true,
	          1002,
	          'WS_ERR_INVALID_OPCODE'
	        );

	        cb(error);
	        return;
	      }

	      this._opcode = this._fragmented;
	    } else if (this._opcode === 0x01 || this._opcode === 0x02) {
	      if (this._fragmented) {
	        const error = this.createError(
	          RangeError,
	          `invalid opcode ${this._opcode}`,
	          true,
	          1002,
	          'WS_ERR_INVALID_OPCODE'
	        );

	        cb(error);
	        return;
	      }

	      this._compressed = compressed;
	    } else if (this._opcode > 0x07 && this._opcode < 0x0b) {
	      if (!this._fin) {
	        const error = this.createError(
	          RangeError,
	          'FIN must be set',
	          true,
	          1002,
	          'WS_ERR_EXPECTED_FIN'
	        );

	        cb(error);
	        return;
	      }

	      if (compressed) {
	        const error = this.createError(
	          RangeError,
	          'RSV1 must be clear',
	          true,
	          1002,
	          'WS_ERR_UNEXPECTED_RSV_1'
	        );

	        cb(error);
	        return;
	      }

	      if (
	        this._payloadLength > 0x7d ||
	        (this._opcode === 0x08 && this._payloadLength === 1)
	      ) {
	        const error = this.createError(
	          RangeError,
	          `invalid payload length ${this._payloadLength}`,
	          true,
	          1002,
	          'WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH'
	        );

	        cb(error);
	        return;
	      }
	    } else {
	      const error = this.createError(
	        RangeError,
	        `invalid opcode ${this._opcode}`,
	        true,
	        1002,
	        'WS_ERR_INVALID_OPCODE'
	      );

	      cb(error);
	      return;
	    }

	    if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
	    this._masked = (buf[1] & 0x80) === 0x80;

	    if (this._isServer) {
	      if (!this._masked) {
	        const error = this.createError(
	          RangeError,
	          'MASK must be set',
	          true,
	          1002,
	          'WS_ERR_EXPECTED_MASK'
	        );

	        cb(error);
	        return;
	      }
	    } else if (this._masked) {
	      const error = this.createError(
	        RangeError,
	        'MASK must be clear',
	        true,
	        1002,
	        'WS_ERR_UNEXPECTED_MASK'
	      );

	      cb(error);
	      return;
	    }

	    if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
	    else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
	    else this.haveLength(cb);
	  }

	  /**
	   * Gets extended payload length (7+16).
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getPayloadLength16(cb) {
	    if (this._bufferedBytes < 2) {
	      this._loop = false;
	      return;
	    }

	    this._payloadLength = this.consume(2).readUInt16BE(0);
	    this.haveLength(cb);
	  }

	  /**
	   * Gets extended payload length (7+64).
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getPayloadLength64(cb) {
	    if (this._bufferedBytes < 8) {
	      this._loop = false;
	      return;
	    }

	    const buf = this.consume(8);
	    const num = buf.readUInt32BE(0);

	    //
	    // The maximum safe integer in JavaScript is 2^53 - 1. An error is returned
	    // if payload length is greater than this number.
	    //
	    if (num > Math.pow(2, 53 - 32) - 1) {
	      const error = this.createError(
	        RangeError,
	        'Unsupported WebSocket frame: payload length > 2^53 - 1',
	        false,
	        1009,
	        'WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH'
	      );

	      cb(error);
	      return;
	    }

	    this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
	    this.haveLength(cb);
	  }

	  /**
	   * Payload length has been read.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  haveLength(cb) {
	    if (this._payloadLength && this._opcode < 0x08) {
	      this._totalPayloadLength += this._payloadLength;
	      if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
	        const error = this.createError(
	          RangeError,
	          'Max payload size exceeded',
	          false,
	          1009,
	          'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
	        );

	        cb(error);
	        return;
	      }
	    }

	    if (this._masked) this._state = GET_MASK;
	    else this._state = GET_DATA;
	  }

	  /**
	   * Reads mask bytes.
	   *
	   * @private
	   */
	  getMask() {
	    if (this._bufferedBytes < 4) {
	      this._loop = false;
	      return;
	    }

	    this._mask = this.consume(4);
	    this._state = GET_DATA;
	  }

	  /**
	   * Reads data bytes.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  getData(cb) {
	    let data = EMPTY_BUFFER;

	    if (this._payloadLength) {
	      if (this._bufferedBytes < this._payloadLength) {
	        this._loop = false;
	        return;
	      }

	      data = this.consume(this._payloadLength);

	      if (
	        this._masked &&
	        (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0
	      ) {
	        unmask(data, this._mask);
	      }
	    }

	    if (this._opcode > 0x07) {
	      this.controlMessage(data, cb);
	      return;
	    }

	    if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
	      const error = this.createError(
	        RangeError,
	        'Too many message fragments',
	        false,
	        1008,
	        'WS_ERR_TOO_MANY_BUFFERED_PARTS'
	      );

	      cb(error);
	      return;
	    }

	    if (this._compressed) {
	      this._state = INFLATING;
	      this.decompress(data, cb);
	      return;
	    }

	    if (data.length) {
	      //
	      // This message is not compressed so its length is the sum of the payload
	      // length of all fragments.
	      //
	      this._messageLength = this._totalPayloadLength;
	      this._fragments.push(data);
	    }

	    this.dataMessage(cb);
	  }

	  /**
	   * Decompresses data.
	   *
	   * @param {Buffer} data Compressed data
	   * @param {Function} cb Callback
	   * @private
	   */
	  decompress(data, cb) {
	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

	    perMessageDeflate.decompress(data, this._fin, (err, buf) => {
	      if (err) return cb(err);

	      if (buf.length) {
	        this._messageLength += buf.length;
	        if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
	          const error = this.createError(
	            RangeError,
	            'Max payload size exceeded',
	            false,
	            1009,
	            'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH'
	          );

	          cb(error);
	          return;
	        }

	        this._fragments.push(buf);
	      }

	      this.dataMessage(cb);
	      if (this._state === GET_INFO) this.startLoop(cb);
	    });
	  }

	  /**
	   * Handles a data message.
	   *
	   * @param {Function} cb Callback
	   * @private
	   */
	  dataMessage(cb) {
	    if (!this._fin) {
	      this._state = GET_INFO;
	      return;
	    }

	    const messageLength = this._messageLength;
	    const fragments = this._fragments;

	    this._totalPayloadLength = 0;
	    this._messageLength = 0;
	    this._fragmented = 0;
	    this._numFragments = 0;
	    this._fragments = [];

	    if (this._opcode === 2) {
	      let data;

	      if (this._binaryType === 'nodebuffer') {
	        data = concat(fragments, messageLength);
	      } else if (this._binaryType === 'arraybuffer') {
	        data = toArrayBuffer(concat(fragments, messageLength));
	      } else if (this._binaryType === 'blob') {
	        data = new Blob(fragments);
	      } else {
	        data = fragments;
	      }

	      if (this._allowSynchronousEvents) {
	        this.emit('message', data, true);
	        this._state = GET_INFO;
	      } else {
	        this._state = DEFER_EVENT;
	        setImmediate(() => {
	          this.emit('message', data, true);
	          this._state = GET_INFO;
	          this.startLoop(cb);
	        });
	      }
	    } else {
	      const buf = concat(fragments, messageLength);

	      if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
	        const error = this.createError(
	          Error,
	          'invalid UTF-8 sequence',
	          true,
	          1007,
	          'WS_ERR_INVALID_UTF8'
	        );

	        cb(error);
	        return;
	      }

	      if (this._state === INFLATING || this._allowSynchronousEvents) {
	        this.emit('message', buf, false);
	        this._state = GET_INFO;
	      } else {
	        this._state = DEFER_EVENT;
	        setImmediate(() => {
	          this.emit('message', buf, false);
	          this._state = GET_INFO;
	          this.startLoop(cb);
	        });
	      }
	    }
	  }

	  /**
	   * Handles a control message.
	   *
	   * @param {Buffer} data Data to handle
	   * @return {(Error|RangeError|undefined)} A possible error
	   * @private
	   */
	  controlMessage(data, cb) {
	    if (this._opcode === 0x08) {
	      if (data.length === 0) {
	        this._loop = false;
	        this.emit('conclude', 1005, EMPTY_BUFFER);
	        this.end();
	      } else {
	        const code = data.readUInt16BE(0);

	        if (!isValidStatusCode(code)) {
	          const error = this.createError(
	            RangeError,
	            `invalid status code ${code}`,
	            true,
	            1002,
	            'WS_ERR_INVALID_CLOSE_CODE'
	          );

	          cb(error);
	          return;
	        }

	        const buf = new FastBuffer(
	          data.buffer,
	          data.byteOffset + 2,
	          data.length - 2
	        );

	        if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
	          const error = this.createError(
	            Error,
	            'invalid UTF-8 sequence',
	            true,
	            1007,
	            'WS_ERR_INVALID_UTF8'
	          );

	          cb(error);
	          return;
	        }

	        this._loop = false;
	        this.emit('conclude', code, buf);
	        this.end();
	      }

	      this._state = GET_INFO;
	      return;
	    }

	    if (this._allowSynchronousEvents) {
	      this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
	      this._state = GET_INFO;
	    } else {
	      this._state = DEFER_EVENT;
	      setImmediate(() => {
	        this.emit(this._opcode === 0x09 ? 'ping' : 'pong', data);
	        this._state = GET_INFO;
	        this.startLoop(cb);
	      });
	    }
	  }

	  /**
	   * Builds an error object.
	   *
	   * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
	   * @param {String} message The error message
	   * @param {Boolean} prefix Specifies whether or not to add a default prefix to
	   *     `message`
	   * @param {Number} statusCode The status code
	   * @param {String} errorCode The exposed error code
	   * @return {(Error|RangeError)} The error
	   * @private
	   */
	  createError(ErrorCtor, message, prefix, statusCode, errorCode) {
	    this._loop = false;
	    this._errored = true;

	    const err = new ErrorCtor(
	      prefix ? `Invalid WebSocket frame: ${message}` : message
	    );

	    Error.captureStackTrace(err, this.createError);
	    err.code = errorCode;
	    err[kStatusCode] = statusCode;
	    return err;
	  }
	}

	receiver = Receiver;
	return receiver;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex" }] */

var sender;
var hasRequiredSender;

function requireSender () {
	if (hasRequiredSender) return sender;
	hasRequiredSender = 1;

	const { Duplex } = require$$0$2;
	const { randomFillSync } = require$$1;
	const {
	  types: { isUint8Array }
	} = require$$2;

	const PerMessageDeflate = requirePermessageDeflate();
	const { EMPTY_BUFFER, kWebSocket, NOOP } = requireConstants();
	const { isBlob, isValidStatusCode } = requireValidation();
	const { mask: applyMask, toBuffer } = requireBufferUtil();

	const kByteLength = Symbol('kByteLength');
	const maskBuffer = Buffer.alloc(4);
	const RANDOM_POOL_SIZE = 8 * 1024;
	let randomPool;
	let randomPoolPointer = RANDOM_POOL_SIZE;

	const DEFAULT = 0;
	const DEFLATING = 1;
	const GET_BLOB_DATA = 2;

	/**
	 * HyBi Sender implementation.
	 */
	class Sender {
	  /**
	   * Creates a Sender instance.
	   *
	   * @param {Duplex} socket The connection socket
	   * @param {Object} [extensions] An object containing the negotiated extensions
	   * @param {Function} [generateMask] The function used to generate the masking
	   *     key
	   */
	  constructor(socket, extensions, generateMask) {
	    this._extensions = extensions || {};

	    if (generateMask) {
	      this._generateMask = generateMask;
	      this._maskBuffer = Buffer.alloc(4);
	    }

	    this._socket = socket;

	    this._firstFragment = true;
	    this._compress = false;

	    this._bufferedBytes = 0;
	    this._queue = [];
	    this._state = DEFAULT;
	    this.onerror = NOOP;
	    this[kWebSocket] = undefined;
	  }

	  /**
	   * Frames a piece of data according to the HyBi WebSocket protocol.
	   *
	   * @param {(Buffer|String)} data The data to frame
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @return {(Buffer|String)[]} The framed data
	   * @public
	   */
	  static frame(data, options) {
	    let mask;
	    let merge = false;
	    let offset = 2;
	    let skipMasking = false;

	    if (options.mask) {
	      mask = options.maskBuffer || maskBuffer;

	      if (options.generateMask) {
	        options.generateMask(mask);
	      } else {
	        if (randomPoolPointer === RANDOM_POOL_SIZE) {
	          /* istanbul ignore else  */
	          if (randomPool === undefined) {
	            //
	            // This is lazily initialized because server-sent frames must not
	            // be masked so it may never be used.
	            //
	            randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
	          }

	          randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
	          randomPoolPointer = 0;
	        }

	        mask[0] = randomPool[randomPoolPointer++];
	        mask[1] = randomPool[randomPoolPointer++];
	        mask[2] = randomPool[randomPoolPointer++];
	        mask[3] = randomPool[randomPoolPointer++];
	      }

	      skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
	      offset = 6;
	    }

	    let dataLength;

	    if (typeof data === 'string') {
	      if (
	        (!options.mask || skipMasking) &&
	        options[kByteLength] !== undefined
	      ) {
	        dataLength = options[kByteLength];
	      } else {
	        data = Buffer.from(data);
	        dataLength = data.length;
	      }
	    } else {
	      dataLength = data.length;
	      merge = options.mask && options.readOnly && !skipMasking;
	    }

	    let payloadLength = dataLength;

	    if (dataLength >= 65536) {
	      offset += 8;
	      payloadLength = 127;
	    } else if (dataLength > 125) {
	      offset += 2;
	      payloadLength = 126;
	    }

	    const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);

	    target[0] = options.fin ? options.opcode | 0x80 : options.opcode;
	    if (options.rsv1) target[0] |= 0x40;

	    target[1] = payloadLength;

	    if (payloadLength === 126) {
	      target.writeUInt16BE(dataLength, 2);
	    } else if (payloadLength === 127) {
	      target[2] = target[3] = 0;
	      target.writeUIntBE(dataLength, 4, 6);
	    }

	    if (!options.mask) return [target, data];

	    target[1] |= 0x80;
	    target[offset - 4] = mask[0];
	    target[offset - 3] = mask[1];
	    target[offset - 2] = mask[2];
	    target[offset - 1] = mask[3];

	    if (skipMasking) return [target, data];

	    if (merge) {
	      applyMask(data, mask, target, offset, dataLength);
	      return [target];
	    }

	    applyMask(data, mask, data, 0, dataLength);
	    return [target, data];
	  }

	  /**
	   * Sends a close message to the other peer.
	   *
	   * @param {Number} [code] The status code component of the body
	   * @param {(String|Buffer)} [data] The message component of the body
	   * @param {Boolean} [mask=false] Specifies whether or not to mask the message
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  close(code, data, mask, cb) {
	    let buf;

	    if (code === undefined) {
	      buf = EMPTY_BUFFER;
	    } else if (typeof code !== 'number' || !isValidStatusCode(code)) {
	      throw new TypeError('First argument must be a valid error code number');
	    } else if (data === undefined || !data.length) {
	      buf = Buffer.allocUnsafe(2);
	      buf.writeUInt16BE(code, 0);
	    } else {
	      const length = Buffer.byteLength(data);

	      if (length > 123) {
	        throw new RangeError('The message must not be greater than 123 bytes');
	      }

	      buf = Buffer.allocUnsafe(2 + length);
	      buf.writeUInt16BE(code, 0);

	      if (typeof data === 'string') {
	        buf.write(data, 2);
	      } else if (isUint8Array(data)) {
	        buf.set(data, 2);
	      } else {
	        throw new TypeError('Second argument must be a string or a Uint8Array');
	      }
	    }

	    const options = {
	      [kByteLength]: buf.length,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x08,
	      readOnly: false,
	      rsv1: false
	    };

	    if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, buf, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(buf, options), cb);
	    }
	  }

	  /**
	   * Sends a ping message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  ping(data, mask, cb) {
	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (byteLength > 125) {
	      throw new RangeError('The data size must not be greater than 125 bytes');
	    }

	    const options = {
	      [kByteLength]: byteLength,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x09,
	      readOnly,
	      rsv1: false
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, false, options, cb]);
	      } else {
	        this.getBlobData(data, false, options, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(data, options), cb);
	    }
	  }

	  /**
	   * Sends a pong message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  pong(data, mask, cb) {
	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (byteLength > 125) {
	      throw new RangeError('The data size must not be greater than 125 bytes');
	    }

	    const options = {
	      [kByteLength]: byteLength,
	      fin: true,
	      generateMask: this._generateMask,
	      mask,
	      maskBuffer: this._maskBuffer,
	      opcode: 0x0a,
	      readOnly,
	      rsv1: false
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, false, options, cb]);
	      } else {
	        this.getBlobData(data, false, options, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, false, options, cb]);
	    } else {
	      this.sendFrame(Sender.frame(data, options), cb);
	    }
	  }

	  /**
	   * Sends a data message to the other peer.
	   *
	   * @param {*} data The message to send
	   * @param {Object} options Options object
	   * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
	   *     or text
	   * @param {Boolean} [options.compress=false] Specifies whether or not to
	   *     compress `data`
	   * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
	   *     last one
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Function} [cb] Callback
	   * @public
	   */
	  send(data, options, cb) {
	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];
	    let opcode = options.binary ? 2 : 1;
	    let rsv1 = options.compress;

	    let byteLength;
	    let readOnly;

	    if (typeof data === 'string') {
	      byteLength = Buffer.byteLength(data);
	      readOnly = false;
	    } else if (isBlob(data)) {
	      byteLength = data.size;
	      readOnly = false;
	    } else {
	      data = toBuffer(data);
	      byteLength = data.length;
	      readOnly = toBuffer.readOnly;
	    }

	    if (this._firstFragment) {
	      this._firstFragment = false;
	      if (
	        rsv1 &&
	        perMessageDeflate &&
	        perMessageDeflate.params[
	          perMessageDeflate._isServer
	            ? 'server_no_context_takeover'
	            : 'client_no_context_takeover'
	        ]
	      ) {
	        rsv1 = byteLength >= perMessageDeflate._threshold;
	      }
	      this._compress = rsv1;
	    } else {
	      rsv1 = false;
	      opcode = 0;
	    }

	    if (options.fin) this._firstFragment = true;

	    const opts = {
	      [kByteLength]: byteLength,
	      fin: options.fin,
	      generateMask: this._generateMask,
	      mask: options.mask,
	      maskBuffer: this._maskBuffer,
	      opcode,
	      readOnly,
	      rsv1
	    };

	    if (isBlob(data)) {
	      if (this._state !== DEFAULT) {
	        this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
	      } else {
	        this.getBlobData(data, this._compress, opts, cb);
	      }
	    } else if (this._state !== DEFAULT) {
	      this.enqueue([this.dispatch, data, this._compress, opts, cb]);
	    } else {
	      this.dispatch(data, this._compress, opts, cb);
	    }
	  }

	  /**
	   * Gets the contents of a blob as binary data.
	   *
	   * @param {Blob} blob The blob
	   * @param {Boolean} [compress=false] Specifies whether or not to compress
	   *     the data
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  getBlobData(blob, compress, options, cb) {
	    this._bufferedBytes += options[kByteLength];
	    this._state = GET_BLOB_DATA;

	    blob
	      .arrayBuffer()
	      .then((arrayBuffer) => {
	        if (this._socket.destroyed) {
	          const err = new Error(
	            'The socket was closed while the blob was being read'
	          );

	          //
	          // `callCallbacks` is called in the next tick to ensure that errors
	          // that might be thrown in the callbacks behave like errors thrown
	          // outside the promise chain.
	          //
	          process.nextTick(callCallbacks, this, err, cb);
	          return;
	        }

	        this._bufferedBytes -= options[kByteLength];
	        const data = toBuffer(arrayBuffer);

	        if (!compress) {
	          this._state = DEFAULT;
	          this.sendFrame(Sender.frame(data, options), cb);
	          this.dequeue();
	        } else {
	          this.dispatch(data, compress, options, cb);
	        }
	      })
	      .catch((err) => {
	        //
	        // `onError` is called in the next tick for the same reason that
	        // `callCallbacks` above is.
	        //
	        process.nextTick(onError, this, err, cb);
	      });
	  }

	  /**
	   * Dispatches a message.
	   *
	   * @param {(Buffer|String)} data The message to send
	   * @param {Boolean} [compress=false] Specifies whether or not to compress
	   *     `data`
	   * @param {Object} options Options object
	   * @param {Boolean} [options.fin=false] Specifies whether or not to set the
	   *     FIN bit
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Boolean} [options.mask=false] Specifies whether or not to mask
	   *     `data`
	   * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
	   *     key
	   * @param {Number} options.opcode The opcode
	   * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
	   *     modified
	   * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
	   *     RSV1 bit
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  dispatch(data, compress, options, cb) {
	    if (!compress) {
	      this.sendFrame(Sender.frame(data, options), cb);
	      return;
	    }

	    const perMessageDeflate = this._extensions[PerMessageDeflate.extensionName];

	    this._bufferedBytes += options[kByteLength];
	    this._state = DEFLATING;
	    perMessageDeflate.compress(data, options.fin, (_, buf) => {
	      if (this._socket.destroyed) {
	        const err = new Error(
	          'The socket was closed while data was being compressed'
	        );

	        callCallbacks(this, err, cb);
	        return;
	      }

	      this._bufferedBytes -= options[kByteLength];
	      this._state = DEFAULT;
	      options.readOnly = false;
	      this.sendFrame(Sender.frame(buf, options), cb);
	      this.dequeue();
	    });
	  }

	  /**
	   * Executes queued send operations.
	   *
	   * @private
	   */
	  dequeue() {
	    while (this._state === DEFAULT && this._queue.length) {
	      const params = this._queue.shift();

	      this._bufferedBytes -= params[3][kByteLength];
	      Reflect.apply(params[0], this, params.slice(1));
	    }
	  }

	  /**
	   * Enqueues a send operation.
	   *
	   * @param {Array} params Send operation parameters.
	   * @private
	   */
	  enqueue(params) {
	    this._bufferedBytes += params[3][kByteLength];
	    this._queue.push(params);
	  }

	  /**
	   * Sends a frame.
	   *
	   * @param {(Buffer | String)[]} list The frame to send
	   * @param {Function} [cb] Callback
	   * @private
	   */
	  sendFrame(list, cb) {
	    if (list.length === 2) {
	      this._socket.cork();
	      this._socket.write(list[0]);
	      this._socket.write(list[1], cb);
	      this._socket.uncork();
	    } else {
	      this._socket.write(list[0], cb);
	    }
	  }
	}

	sender = Sender;

	/**
	 * Calls queued callbacks with an error.
	 *
	 * @param {Sender} sender The `Sender` instance
	 * @param {Error} err The error to call the callbacks with
	 * @param {Function} [cb] The first callback
	 * @private
	 */
	function callCallbacks(sender, err, cb) {
	  if (typeof cb === 'function') cb(err);

	  for (let i = 0; i < sender._queue.length; i++) {
	    const params = sender._queue[i];
	    const callback = params[params.length - 1];

	    if (typeof callback === 'function') callback(err);
	  }
	}

	/**
	 * Handles a `Sender` error.
	 *
	 * @param {Sender} sender The `Sender` instance
	 * @param {Error} err The error
	 * @param {Function} [cb] The first pending callback
	 * @private
	 */
	function onError(sender, err, cb) {
	  callCallbacks(sender, err, cb);
	  sender.onerror(err);
	}
	return sender;
}

var eventTarget;
var hasRequiredEventTarget;

function requireEventTarget () {
	if (hasRequiredEventTarget) return eventTarget;
	hasRequiredEventTarget = 1;

	const { kForOnEventAttribute, kListener } = requireConstants();

	const kCode = Symbol('kCode');
	const kData = Symbol('kData');
	const kError = Symbol('kError');
	const kMessage = Symbol('kMessage');
	const kReason = Symbol('kReason');
	const kTarget = Symbol('kTarget');
	const kType = Symbol('kType');
	const kWasClean = Symbol('kWasClean');

	/**
	 * Class representing an event.
	 */
	class Event {
	  /**
	   * Create a new `Event`.
	   *
	   * @param {String} type The name of the event
	   * @throws {TypeError} If the `type` argument is not specified
	   */
	  constructor(type) {
	    this[kTarget] = null;
	    this[kType] = type;
	  }

	  /**
	   * @type {*}
	   */
	  get target() {
	    return this[kTarget];
	  }

	  /**
	   * @type {String}
	   */
	  get type() {
	    return this[kType];
	  }
	}

	Object.defineProperty(Event.prototype, 'target', { enumerable: true });
	Object.defineProperty(Event.prototype, 'type', { enumerable: true });

	/**
	 * Class representing a close event.
	 *
	 * @extends Event
	 */
	class CloseEvent extends Event {
	  /**
	   * Create a new `CloseEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {Number} [options.code=0] The status code explaining why the
	   *     connection was closed
	   * @param {String} [options.reason=''] A human-readable string explaining why
	   *     the connection was closed
	   * @param {Boolean} [options.wasClean=false] Indicates whether or not the
	   *     connection was cleanly closed
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kCode] = options.code === undefined ? 0 : options.code;
	    this[kReason] = options.reason === undefined ? '' : options.reason;
	    this[kWasClean] = options.wasClean === undefined ? false : options.wasClean;
	  }

	  /**
	   * @type {Number}
	   */
	  get code() {
	    return this[kCode];
	  }

	  /**
	   * @type {String}
	   */
	  get reason() {
	    return this[kReason];
	  }

	  /**
	   * @type {Boolean}
	   */
	  get wasClean() {
	    return this[kWasClean];
	  }
	}

	Object.defineProperty(CloseEvent.prototype, 'code', { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, 'reason', { enumerable: true });
	Object.defineProperty(CloseEvent.prototype, 'wasClean', { enumerable: true });

	/**
	 * Class representing an error event.
	 *
	 * @extends Event
	 */
	class ErrorEvent extends Event {
	  /**
	   * Create a new `ErrorEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {*} [options.error=null] The error that generated this event
	   * @param {String} [options.message=''] The error message
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kError] = options.error === undefined ? null : options.error;
	    this[kMessage] = options.message === undefined ? '' : options.message;
	  }

	  /**
	   * @type {*}
	   */
	  get error() {
	    return this[kError];
	  }

	  /**
	   * @type {String}
	   */
	  get message() {
	    return this[kMessage];
	  }
	}

	Object.defineProperty(ErrorEvent.prototype, 'error', { enumerable: true });
	Object.defineProperty(ErrorEvent.prototype, 'message', { enumerable: true });

	/**
	 * Class representing a message event.
	 *
	 * @extends Event
	 */
	class MessageEvent extends Event {
	  /**
	   * Create a new `MessageEvent`.
	   *
	   * @param {String} type The name of the event
	   * @param {Object} [options] A dictionary object that allows for setting
	   *     attributes via object members of the same name
	   * @param {*} [options.data=null] The message content
	   */
	  constructor(type, options = {}) {
	    super(type);

	    this[kData] = options.data === undefined ? null : options.data;
	  }

	  /**
	   * @type {*}
	   */
	  get data() {
	    return this[kData];
	  }
	}

	Object.defineProperty(MessageEvent.prototype, 'data', { enumerable: true });

	/**
	 * This provides methods for emulating the `EventTarget` interface. It's not
	 * meant to be used directly.
	 *
	 * @mixin
	 */
	const EventTarget = {
	  /**
	   * Register an event listener.
	   *
	   * @param {String} type A string representing the event type to listen for
	   * @param {(Function|Object)} handler The listener to add
	   * @param {Object} [options] An options object specifies characteristics about
	   *     the event listener
	   * @param {Boolean} [options.once=false] A `Boolean` indicating that the
	   *     listener should be invoked at most once after being added. If `true`,
	   *     the listener would be automatically removed when invoked.
	   * @public
	   */
	  addEventListener(type, handler, options = {}) {
	    for (const listener of this.listeners(type)) {
	      if (
	        !options[kForOnEventAttribute] &&
	        listener[kListener] === handler &&
	        !listener[kForOnEventAttribute]
	      ) {
	        return;
	      }
	    }

	    let wrapper;

	    if (type === 'message') {
	      wrapper = function onMessage(data, isBinary) {
	        const event = new MessageEvent('message', {
	          data: isBinary ? data : data.toString()
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'close') {
	      wrapper = function onClose(code, message) {
	        const event = new CloseEvent('close', {
	          code,
	          reason: message.toString(),
	          wasClean: this._closeFrameReceived && this._closeFrameSent
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'error') {
	      wrapper = function onError(error) {
	        const event = new ErrorEvent('error', {
	          error,
	          message: error.message
	        });

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else if (type === 'open') {
	      wrapper = function onOpen() {
	        const event = new Event('open');

	        event[kTarget] = this;
	        callListener(handler, this, event);
	      };
	    } else {
	      return;
	    }

	    wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
	    wrapper[kListener] = handler;

	    if (options.once) {
	      this.once(type, wrapper);
	    } else {
	      this.on(type, wrapper);
	    }
	  },

	  /**
	   * Remove an event listener.
	   *
	   * @param {String} type A string representing the event type to remove
	   * @param {(Function|Object)} handler The listener to remove
	   * @public
	   */
	  removeEventListener(type, handler) {
	    for (const listener of this.listeners(type)) {
	      if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
	        this.removeListener(type, listener);
	        break;
	      }
	    }
	  }
	};

	eventTarget = {
	  CloseEvent,
	  ErrorEvent,
	  Event,
	  EventTarget,
	  MessageEvent
	};

	/**
	 * Call an event listener
	 *
	 * @param {(Function|Object)} listener The listener to call
	 * @param {*} thisArg The value to use as `this`` when calling the listener
	 * @param {Event} event The event to pass to the listener
	 * @private
	 */
	function callListener(listener, thisArg, event) {
	  if (typeof listener === 'object' && listener.handleEvent) {
	    listener.handleEvent.call(listener, event);
	  } else {
	    listener.call(thisArg, event);
	  }
	}
	return eventTarget;
}

var extension;
var hasRequiredExtension;

function requireExtension () {
	if (hasRequiredExtension) return extension;
	hasRequiredExtension = 1;

	const { tokenChars } = requireValidation();

	/**
	 * Adds an offer to the map of extension offers or a parameter to the map of
	 * parameters.
	 *
	 * @param {Object} dest The map of extension offers or parameters
	 * @param {String} name The extension or parameter name
	 * @param {(Object|Boolean|String)} elem The extension parameters or the
	 *     parameter value
	 * @private
	 */
	function push(dest, name, elem) {
	  if (dest[name] === undefined) dest[name] = [elem];
	  else dest[name].push(elem);
	}

	/**
	 * Parses the `Sec-WebSocket-Extensions` header into an object.
	 *
	 * @param {String} header The field value of the header
	 * @return {Object} The parsed object
	 * @public
	 */
	function parse(header) {
	  const offers = Object.create(null);
	  let params = Object.create(null);
	  let mustUnescape = false;
	  let isEscaping = false;
	  let inQuotes = false;
	  let extensionName;
	  let paramName;
	  let start = -1;
	  let code = -1;
	  let end = -1;
	  let i = 0;

	  for (; i < header.length; i++) {
	    code = header.charCodeAt(i);

	    if (extensionName === undefined) {
	      if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (
	        i !== 0 &&
	        (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */
	      ) {
	        if (end === -1 && start !== -1) end = i;
	      } else if (code === 0x3b /* ';' */ || code === 0x2c /* ',' */) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        const name = header.slice(start, end);
	        if (code === 0x2c) {
	          push(offers, name, params);
	          params = Object.create(null);
	        } else {
	          extensionName = name;
	        }

	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    } else if (paramName === undefined) {
	      if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (code === 0x20 || code === 0x09) {
	        if (end === -1 && start !== -1) end = i;
	      } else if (code === 0x3b || code === 0x2c) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        push(params, header.slice(start, end), true);
	        if (code === 0x2c) {
	          push(offers, extensionName, params);
	          params = Object.create(null);
	          extensionName = undefined;
	        }

	        start = end = -1;
	      } else if (code === 0x3d /* '=' */ && start !== -1 && end === -1) {
	        paramName = header.slice(start, i);
	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    } else {
	      //
	      // The value of a quoted-string after unescaping must conform to the
	      // token ABNF, so only token characters are valid.
	      // Ref: https://tools.ietf.org/html/rfc6455#section-9.1
	      //
	      if (isEscaping) {
	        if (tokenChars[code] !== 1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }
	        if (start === -1) start = i;
	        else if (!mustUnescape) mustUnescape = true;
	        isEscaping = false;
	      } else if (inQuotes) {
	        if (tokenChars[code] === 1) {
	          if (start === -1) start = i;
	        } else if (code === 0x22 /* '"' */ && start !== -1) {
	          inQuotes = false;
	          end = i;
	        } else if (code === 0x5c /* '\' */) {
	          isEscaping = true;
	        } else {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }
	      } else if (code === 0x22 && header.charCodeAt(i - 1) === 0x3d) {
	        inQuotes = true;
	      } else if (end === -1 && tokenChars[code] === 1) {
	        if (start === -1) start = i;
	      } else if (start !== -1 && (code === 0x20 || code === 0x09)) {
	        if (end === -1) end = i;
	      } else if (code === 0x3b || code === 0x2c) {
	        if (start === -1) {
	          throw new SyntaxError(`Unexpected character at index ${i}`);
	        }

	        if (end === -1) end = i;
	        let value = header.slice(start, end);
	        if (mustUnescape) {
	          value = value.replace(/\\/g, '');
	          mustUnescape = false;
	        }
	        push(params, paramName, value);
	        if (code === 0x2c) {
	          push(offers, extensionName, params);
	          params = Object.create(null);
	          extensionName = undefined;
	        }

	        paramName = undefined;
	        start = end = -1;
	      } else {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }
	    }
	  }

	  if (start === -1 || inQuotes || code === 0x20 || code === 0x09) {
	    throw new SyntaxError('Unexpected end of input');
	  }

	  if (end === -1) end = i;
	  const token = header.slice(start, end);
	  if (extensionName === undefined) {
	    push(offers, token, params);
	  } else {
	    if (paramName === undefined) {
	      push(params, token, true);
	    } else if (mustUnescape) {
	      push(params, paramName, token.replace(/\\/g, ''));
	    } else {
	      push(params, paramName, token);
	    }
	    push(offers, extensionName, params);
	  }

	  return offers;
	}

	/**
	 * Builds the `Sec-WebSocket-Extensions` header field value.
	 *
	 * @param {Object} extensions The map of extensions and parameters to format
	 * @return {String} A string representing the given object
	 * @public
	 */
	function format(extensions) {
	  return Object.keys(extensions)
	    .map((extension) => {
	      let configurations = extensions[extension];
	      if (!Array.isArray(configurations)) configurations = [configurations];
	      return configurations
	        .map((params) => {
	          return [extension]
	            .concat(
	              Object.keys(params).map((k) => {
	                let values = params[k];
	                if (!Array.isArray(values)) values = [values];
	                return values
	                  .map((v) => (v === true ? k : `${k}=${v}`))
	                  .join('; ');
	              })
	            )
	            .join('; ');
	        })
	        .join(', ');
	    })
	    .join(', ');
	}

	extension = { format, parse };
	return extension;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex|Readable$", "caughtErrors": "none" }] */

var websocket;
var hasRequiredWebsocket;

function requireWebsocket () {
	if (hasRequiredWebsocket) return websocket;
	hasRequiredWebsocket = 1;

	const EventEmitter = require$$0$3;
	const https = require$$1$1;
	const http = require$$2$1;
	const net = require$$3;
	const tls = require$$4;
	const { randomBytes, createHash } = require$$1;
	const { Duplex, Readable } = require$$0$2;
	const { URL } = require$$7;

	const PerMessageDeflate = requirePermessageDeflate();
	const Receiver = requireReceiver();
	const Sender = requireSender();
	const { isBlob } = requireValidation();

	const {
	  BINARY_TYPES,
	  CLOSE_TIMEOUT,
	  EMPTY_BUFFER,
	  GUID,
	  kForOnEventAttribute,
	  kListener,
	  kStatusCode,
	  kWebSocket,
	  NOOP
	} = requireConstants();
	const {
	  EventTarget: { addEventListener, removeEventListener }
	} = requireEventTarget();
	const { format, parse } = requireExtension();
	const { toBuffer } = requireBufferUtil();

	const kAborted = Symbol('kAborted');
	const protocolVersions = [8, 13];
	const readyStates = ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'];
	const subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;

	/**
	 * Class representing a WebSocket.
	 *
	 * @extends EventEmitter
	 */
	class WebSocket extends EventEmitter {
	  /**
	   * Create a new `WebSocket`.
	   *
	   * @param {(String|URL)} address The URL to which to connect
	   * @param {(String|String[])} [protocols] The subprotocols
	   * @param {Object} [options] Connection options
	   */
	  constructor(address, protocols, options) {
	    super();

	    this._binaryType = BINARY_TYPES[0];
	    this._closeCode = 1006;
	    this._closeFrameReceived = false;
	    this._closeFrameSent = false;
	    this._closeMessage = EMPTY_BUFFER;
	    this._closeTimer = null;
	    this._errorEmitted = false;
	    this._extensions = {};
	    this._paused = false;
	    this._protocol = '';
	    this._readyState = WebSocket.CONNECTING;
	    this._receiver = null;
	    this._sender = null;
	    this._socket = null;

	    if (address !== null) {
	      this._bufferedAmount = 0;
	      this._isServer = false;
	      this._redirects = 0;

	      if (protocols === undefined) {
	        protocols = [];
	      } else if (!Array.isArray(protocols)) {
	        if (typeof protocols === 'object' && protocols !== null) {
	          options = protocols;
	          protocols = [];
	        } else {
	          protocols = [protocols];
	        }
	      }

	      initAsClient(this, address, protocols, options);
	    } else {
	      this._autoPong = options.autoPong;
	      this._closeTimeout = options.closeTimeout;
	      this._isServer = true;
	    }
	  }

	  /**
	   * For historical reasons, the custom "nodebuffer" type is used by the default
	   * instead of "blob".
	   *
	   * @type {String}
	   */
	  get binaryType() {
	    return this._binaryType;
	  }

	  set binaryType(type) {
	    if (!BINARY_TYPES.includes(type)) return;

	    this._binaryType = type;

	    //
	    // Allow to change `binaryType` on the fly.
	    //
	    if (this._receiver) this._receiver._binaryType = type;
	  }

	  /**
	   * @type {Number}
	   */
	  get bufferedAmount() {
	    if (!this._socket) return this._bufferedAmount;

	    return this._socket._writableState.length + this._sender._bufferedBytes;
	  }

	  /**
	   * @type {String}
	   */
	  get extensions() {
	    return Object.keys(this._extensions).join();
	  }

	  /**
	   * @type {Boolean}
	   */
	  get isPaused() {
	    return this._paused;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onclose() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onerror() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onopen() {
	    return null;
	  }

	  /**
	   * @type {Function}
	   */
	  /* istanbul ignore next */
	  get onmessage() {
	    return null;
	  }

	  /**
	   * @type {String}
	   */
	  get protocol() {
	    return this._protocol;
	  }

	  /**
	   * @type {Number}
	   */
	  get readyState() {
	    return this._readyState;
	  }

	  /**
	   * @type {String}
	   */
	  get url() {
	    return this._url;
	  }

	  /**
	   * Set up the socket and the internal resources.
	   *
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Object} options Options object
	   * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {Function} [options.generateMask] The function used to generate the
	   *     masking key
	   * @param {Number} [options.maxBufferedChunks=0] The maximum number of
	   *     buffered data chunks
	   * @param {Number} [options.maxFragments=0] The maximum number of message
	   *     fragments
	   * @param {Number} [options.maxPayload=0] The maximum allowed message size
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   * @private
	   */
	  setSocket(socket, head, options) {
	    const receiver = new Receiver({
	      allowSynchronousEvents: options.allowSynchronousEvents,
	      binaryType: this.binaryType,
	      extensions: this._extensions,
	      isServer: this._isServer,
	      maxBufferedChunks: options.maxBufferedChunks,
	      maxFragments: options.maxFragments,
	      maxPayload: options.maxPayload,
	      skipUTF8Validation: options.skipUTF8Validation
	    });

	    const sender = new Sender(socket, this._extensions, options.generateMask);

	    this._receiver = receiver;
	    this._sender = sender;
	    this._socket = socket;

	    receiver[kWebSocket] = this;
	    sender[kWebSocket] = this;
	    socket[kWebSocket] = this;

	    receiver.on('conclude', receiverOnConclude);
	    receiver.on('drain', receiverOnDrain);
	    receiver.on('error', receiverOnError);
	    receiver.on('message', receiverOnMessage);
	    receiver.on('ping', receiverOnPing);
	    receiver.on('pong', receiverOnPong);

	    sender.onerror = senderOnError;

	    //
	    // These methods may not be available if `socket` is just a `Duplex`.
	    //
	    if (socket.setTimeout) socket.setTimeout(0);
	    if (socket.setNoDelay) socket.setNoDelay();

	    if (head.length > 0) socket.unshift(head);

	    socket.on('close', socketOnClose);
	    socket.on('data', socketOnData);
	    socket.on('end', socketOnEnd);
	    socket.on('error', socketOnError);

	    this._readyState = WebSocket.OPEN;
	    this.emit('open');
	  }

	  /**
	   * Emit the `'close'` event.
	   *
	   * @private
	   */
	  emitClose() {
	    if (!this._socket) {
	      this._readyState = WebSocket.CLOSED;
	      this.emit('close', this._closeCode, this._closeMessage);
	      return;
	    }

	    if (this._extensions[PerMessageDeflate.extensionName]) {
	      this._extensions[PerMessageDeflate.extensionName].cleanup();
	    }

	    this._receiver.removeAllListeners();
	    this._readyState = WebSocket.CLOSED;
	    this.emit('close', this._closeCode, this._closeMessage);
	  }

	  /**
	   * Start a closing handshake.
	   *
	   *          +----------+   +-----------+   +----------+
	   *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
	   *    |     +----------+   +-----------+   +----------+     |
	   *          +----------+   +-----------+         |
	   * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
	   *          +----------+   +-----------+   |
	   *    |           |                        |   +---+        |
	   *                +------------------------+-->|fin| - - - -
	   *    |         +---+                      |   +---+
	   *     - - - - -|fin|<---------------------+
	   *              +---+
	   *
	   * @param {Number} [code] Status code explaining why the connection is closing
	   * @param {(String|Buffer)} [data] The reason why the connection is
	   *     closing
	   * @public
	   */
	  close(code, data) {
	    if (this.readyState === WebSocket.CLOSED) return;
	    if (this.readyState === WebSocket.CONNECTING) {
	      const msg = 'WebSocket was closed before the connection was established';
	      abortHandshake(this, this._req, msg);
	      return;
	    }

	    if (this.readyState === WebSocket.CLOSING) {
	      if (
	        this._closeFrameSent &&
	        (this._closeFrameReceived || this._receiver._writableState.errorEmitted)
	      ) {
	        this._socket.end();
	      }

	      return;
	    }

	    this._readyState = WebSocket.CLOSING;
	    this._sender.close(code, data, !this._isServer, (err) => {
	      //
	      // This error is handled by the `'error'` listener on the socket. We only
	      // want to know if the close frame has been sent here.
	      //
	      if (err) return;

	      this._closeFrameSent = true;

	      if (
	        this._closeFrameReceived ||
	        this._receiver._writableState.errorEmitted
	      ) {
	        this._socket.end();
	      }
	    });

	    setCloseTimer(this);
	  }

	  /**
	   * Pause the socket.
	   *
	   * @public
	   */
	  pause() {
	    if (
	      this.readyState === WebSocket.CONNECTING ||
	      this.readyState === WebSocket.CLOSED
	    ) {
	      return;
	    }

	    this._paused = true;
	    this._socket.pause();
	  }

	  /**
	   * Send a ping.
	   *
	   * @param {*} [data] The data to send
	   * @param {Boolean} [mask] Indicates whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when the ping is sent
	   * @public
	   */
	  ping(data, mask, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof data === 'function') {
	      cb = data;
	      data = mask = undefined;
	    } else if (typeof mask === 'function') {
	      cb = mask;
	      mask = undefined;
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    if (mask === undefined) mask = !this._isServer;
	    this._sender.ping(data || EMPTY_BUFFER, mask, cb);
	  }

	  /**
	   * Send a pong.
	   *
	   * @param {*} [data] The data to send
	   * @param {Boolean} [mask] Indicates whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when the pong is sent
	   * @public
	   */
	  pong(data, mask, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof data === 'function') {
	      cb = data;
	      data = mask = undefined;
	    } else if (typeof mask === 'function') {
	      cb = mask;
	      mask = undefined;
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    if (mask === undefined) mask = !this._isServer;
	    this._sender.pong(data || EMPTY_BUFFER, mask, cb);
	  }

	  /**
	   * Resume the socket.
	   *
	   * @public
	   */
	  resume() {
	    if (
	      this.readyState === WebSocket.CONNECTING ||
	      this.readyState === WebSocket.CLOSED
	    ) {
	      return;
	    }

	    this._paused = false;
	    if (!this._receiver._writableState.needDrain) this._socket.resume();
	  }

	  /**
	   * Send a data message.
	   *
	   * @param {*} data The message to send
	   * @param {Object} [options] Options object
	   * @param {Boolean} [options.binary] Specifies whether `data` is binary or
	   *     text
	   * @param {Boolean} [options.compress] Specifies whether or not to compress
	   *     `data`
	   * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
	   *     last one
	   * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
	   * @param {Function} [cb] Callback which is executed when data is written out
	   * @public
	   */
	  send(data, options, cb) {
	    if (this.readyState === WebSocket.CONNECTING) {
	      throw new Error('WebSocket is not open: readyState 0 (CONNECTING)');
	    }

	    if (typeof options === 'function') {
	      cb = options;
	      options = {};
	    }

	    if (typeof data === 'number') data = data.toString();

	    if (this.readyState !== WebSocket.OPEN) {
	      sendAfterClose(this, data, cb);
	      return;
	    }

	    const opts = {
	      binary: typeof data !== 'string',
	      mask: !this._isServer,
	      compress: true,
	      fin: true,
	      ...options
	    };

	    if (!this._extensions[PerMessageDeflate.extensionName]) {
	      opts.compress = false;
	    }

	    this._sender.send(data || EMPTY_BUFFER, opts, cb);
	  }

	  /**
	   * Forcibly close the connection.
	   *
	   * @public
	   */
	  terminate() {
	    if (this.readyState === WebSocket.CLOSED) return;
	    if (this.readyState === WebSocket.CONNECTING) {
	      const msg = 'WebSocket was closed before the connection was established';
	      abortHandshake(this, this._req, msg);
	      return;
	    }

	    if (this._socket) {
	      this._readyState = WebSocket.CLOSING;
	      this._socket.destroy();
	    }
	  }
	}

	/**
	 * @constant {Number} CONNECTING
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CONNECTING', {
	  enumerable: true,
	  value: readyStates.indexOf('CONNECTING')
	});

	/**
	 * @constant {Number} CONNECTING
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CONNECTING', {
	  enumerable: true,
	  value: readyStates.indexOf('CONNECTING')
	});

	/**
	 * @constant {Number} OPEN
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'OPEN', {
	  enumerable: true,
	  value: readyStates.indexOf('OPEN')
	});

	/**
	 * @constant {Number} OPEN
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'OPEN', {
	  enumerable: true,
	  value: readyStates.indexOf('OPEN')
	});

	/**
	 * @constant {Number} CLOSING
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CLOSING', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSING')
	});

	/**
	 * @constant {Number} CLOSING
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CLOSING', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSING')
	});

	/**
	 * @constant {Number} CLOSED
	 * @memberof WebSocket
	 */
	Object.defineProperty(WebSocket, 'CLOSED', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSED')
	});

	/**
	 * @constant {Number} CLOSED
	 * @memberof WebSocket.prototype
	 */
	Object.defineProperty(WebSocket.prototype, 'CLOSED', {
	  enumerable: true,
	  value: readyStates.indexOf('CLOSED')
	});

	[
	  'binaryType',
	  'bufferedAmount',
	  'extensions',
	  'isPaused',
	  'protocol',
	  'readyState',
	  'url'
	].forEach((property) => {
	  Object.defineProperty(WebSocket.prototype, property, { enumerable: true });
	});

	//
	// Add the `onopen`, `onerror`, `onclose`, and `onmessage` attributes.
	// See https://html.spec.whatwg.org/multipage/comms.html#the-websocket-interface
	//
	['open', 'error', 'close', 'message'].forEach((method) => {
	  Object.defineProperty(WebSocket.prototype, `on${method}`, {
	    enumerable: true,
	    get() {
	      for (const listener of this.listeners(method)) {
	        if (listener[kForOnEventAttribute]) return listener[kListener];
	      }

	      return null;
	    },
	    set(handler) {
	      for (const listener of this.listeners(method)) {
	        if (listener[kForOnEventAttribute]) {
	          this.removeListener(method, listener);
	          break;
	        }
	      }

	      if (typeof handler !== 'function') return;

	      this.addEventListener(method, handler, {
	        [kForOnEventAttribute]: true
	      });
	    }
	  });
	});

	WebSocket.prototype.addEventListener = addEventListener;
	WebSocket.prototype.removeEventListener = removeEventListener;

	websocket = WebSocket;

	/**
	 * Initialize a WebSocket client.
	 *
	 * @param {WebSocket} websocket The client to initialize
	 * @param {(String|URL)} address The URL to which to connect
	 * @param {Array} protocols The subprotocols
	 * @param {Object} [options] Connection options
	 * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether any
	 *     of the `'message'`, `'ping'`, and `'pong'` events can be emitted multiple
	 *     times in the same tick
	 * @param {Boolean} [options.autoPong=true] Specifies whether or not to
	 *     automatically send a pong in response to a ping
	 * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to wait
	 *     for the closing handshake to finish after `websocket.close()` is called
	 * @param {Function} [options.finishRequest] A function which can be used to
	 *     customize the headers of each http request before it is sent
	 * @param {Boolean} [options.followRedirects=false] Whether or not to follow
	 *     redirects
	 * @param {Function} [options.generateMask] The function used to generate the
	 *     masking key
	 * @param {Number} [options.handshakeTimeout] Timeout in milliseconds for the
	 *     handshake request
	 * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
	 *     buffered data chunks
	 * @param {Number} [options.maxFragments=16384] The maximum number of message
	 *     fragments
	 * @param {Number} [options.maxPayload=104857600] The maximum allowed message
	 *     size
	 * @param {Number} [options.maxRedirects=10] The maximum number of redirects
	 *     allowed
	 * @param {String} [options.origin] Value of the `Origin` or
	 *     `Sec-WebSocket-Origin` header
	 * @param {(Boolean|Object)} [options.perMessageDeflate=true] Enable/disable
	 *     permessage-deflate
	 * @param {Number} [options.protocolVersion=13] Value of the
	 *     `Sec-WebSocket-Version` header
	 * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	 *     not to skip UTF-8 validation for text and close messages
	 * @private
	 */
	function initAsClient(websocket, address, protocols, options) {
	  const opts = {
	    allowSynchronousEvents: true,
	    autoPong: true,
	    closeTimeout: CLOSE_TIMEOUT,
	    protocolVersion: protocolVersions[1],
	    maxBufferedChunks: 256 * 1024,
	    maxFragments: 16 * 1024,
	    maxPayload: 100 * 1024 * 1024,
	    skipUTF8Validation: false,
	    perMessageDeflate: true,
	    followRedirects: false,
	    maxRedirects: 10,
	    ...options,
	    socketPath: undefined,
	    hostname: undefined,
	    protocol: undefined,
	    timeout: undefined,
	    method: 'GET',
	    host: undefined,
	    path: undefined,
	    port: undefined
	  };

	  websocket._autoPong = opts.autoPong;
	  websocket._closeTimeout = opts.closeTimeout;

	  if (!protocolVersions.includes(opts.protocolVersion)) {
	    throw new RangeError(
	      `Unsupported protocol version: ${opts.protocolVersion} ` +
	        `(supported versions: ${protocolVersions.join(', ')})`
	    );
	  }

	  let parsedUrl;

	  if (address instanceof URL) {
	    parsedUrl = address;
	  } else {
	    try {
	      parsedUrl = new URL(address);
	    } catch {
	      throw new SyntaxError(`Invalid URL: ${address}`);
	    }
	  }

	  if (parsedUrl.protocol === 'http:') {
	    parsedUrl.protocol = 'ws:';
	  } else if (parsedUrl.protocol === 'https:') {
	    parsedUrl.protocol = 'wss:';
	  }

	  websocket._url = parsedUrl.href;

	  const isSecure = parsedUrl.protocol === 'wss:';
	  const isIpcUrl = parsedUrl.protocol === 'ws+unix:';
	  let invalidUrlMessage;

	  if (parsedUrl.protocol !== 'ws:' && !isSecure && !isIpcUrl) {
	    invalidUrlMessage =
	      'The URL\'s protocol must be one of "ws:", "wss:", ' +
	      '"http:", "https:", or "ws+unix:"';
	  } else if (isIpcUrl && !parsedUrl.pathname) {
	    invalidUrlMessage = "The URL's pathname is empty";
	  } else if (parsedUrl.hash) {
	    invalidUrlMessage = 'The URL contains a fragment identifier';
	  }

	  if (invalidUrlMessage) {
	    const err = new SyntaxError(invalidUrlMessage);

	    if (websocket._redirects === 0) {
	      throw err;
	    } else {
	      emitErrorAndClose(websocket, err);
	      return;
	    }
	  }

	  const defaultPort = isSecure ? 443 : 80;
	  const key = randomBytes(16).toString('base64');
	  const request = isSecure ? https.request : http.request;
	  const protocolSet = new Set();
	  let perMessageDeflate;

	  opts.createConnection =
	    opts.createConnection || (isSecure ? tlsConnect : netConnect);
	  opts.defaultPort = opts.defaultPort || defaultPort;
	  opts.port = parsedUrl.port || defaultPort;
	  opts.host = parsedUrl.hostname.startsWith('[')
	    ? parsedUrl.hostname.slice(1, -1)
	    : parsedUrl.hostname;
	  opts.headers = {
	    ...opts.headers,
	    'Sec-WebSocket-Version': opts.protocolVersion,
	    'Sec-WebSocket-Key': key,
	    Connection: 'Upgrade',
	    Upgrade: 'websocket'
	  };
	  opts.path = parsedUrl.pathname + parsedUrl.search;
	  opts.timeout = opts.handshakeTimeout;

	  if (opts.perMessageDeflate) {
	    perMessageDeflate = new PerMessageDeflate({
	      ...opts.perMessageDeflate,
	      isServer: false,
	      maxPayload: opts.maxPayload
	    });
	    opts.headers['Sec-WebSocket-Extensions'] = format({
	      [PerMessageDeflate.extensionName]: perMessageDeflate.offer()
	    });
	  }
	  if (protocols.length) {
	    for (const protocol of protocols) {
	      if (
	        typeof protocol !== 'string' ||
	        !subprotocolRegex.test(protocol) ||
	        protocolSet.has(protocol)
	      ) {
	        throw new SyntaxError(
	          'An invalid or duplicated subprotocol was specified'
	        );
	      }

	      protocolSet.add(protocol);
	    }

	    opts.headers['Sec-WebSocket-Protocol'] = protocols.join(',');
	  }
	  if (opts.origin) {
	    if (opts.protocolVersion < 13) {
	      opts.headers['Sec-WebSocket-Origin'] = opts.origin;
	    } else {
	      opts.headers.Origin = opts.origin;
	    }
	  }
	  if (parsedUrl.username || parsedUrl.password) {
	    opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
	  }

	  if (isIpcUrl) {
	    const parts = opts.path.split(':');

	    opts.socketPath = parts[0];
	    opts.path = parts[1];
	  }

	  let req;

	  if (opts.followRedirects) {
	    if (websocket._redirects === 0) {
	      websocket._originalIpc = isIpcUrl;
	      websocket._originalSecure = isSecure;
	      websocket._originalHostOrSocketPath = isIpcUrl
	        ? opts.socketPath
	        : parsedUrl.host;

	      const headers = options && options.headers;

	      //
	      // Shallow copy the user provided options so that headers can be changed
	      // without mutating the original object.
	      //
	      options = { ...options, headers: {} };

	      if (headers) {
	        for (const [key, value] of Object.entries(headers)) {
	          options.headers[key.toLowerCase()] = value;
	        }
	      }
	    } else if (websocket.listenerCount('redirect') === 0) {
	      const isSameHost = isIpcUrl
	        ? websocket._originalIpc
	          ? opts.socketPath === websocket._originalHostOrSocketPath
	          : false
	        : websocket._originalIpc
	          ? false
	          : parsedUrl.host === websocket._originalHostOrSocketPath;

	      if (!isSameHost || (websocket._originalSecure && !isSecure)) {
	        //
	        // Match curl 7.77.0 behavior and drop the following headers. These
	        // headers are also dropped when following a redirect to a subdomain.
	        //
	        delete opts.headers.authorization;
	        delete opts.headers.cookie;

	        if (!isSameHost) delete opts.headers.host;

	        opts.auth = undefined;
	      }
	    }

	    //
	    // Match curl 7.77.0 behavior and make the first `Authorization` header win.
	    // If the `Authorization` header is set, then there is nothing to do as it
	    // will take precedence.
	    //
	    if (opts.auth && !options.headers.authorization) {
	      options.headers.authorization =
	        'Basic ' + Buffer.from(opts.auth).toString('base64');
	    }

	    req = websocket._req = request(opts);

	    if (websocket._redirects) {
	      //
	      // Unlike what is done for the `'upgrade'` event, no early exit is
	      // triggered here if the user calls `websocket.close()` or
	      // `websocket.terminate()` from a listener of the `'redirect'` event. This
	      // is because the user can also call `request.destroy()` with an error
	      // before calling `websocket.close()` or `websocket.terminate()` and this
	      // would result in an error being emitted on the `request` object with no
	      // `'error'` event listeners attached.
	      //
	      websocket.emit('redirect', websocket.url, req);
	    }
	  } else {
	    req = websocket._req = request(opts);
	  }

	  if (opts.timeout) {
	    req.on('timeout', () => {
	      abortHandshake(websocket, req, 'Opening handshake has timed out');
	    });
	  }

	  req.on('error', (err) => {
	    if (req === null || req[kAborted]) return;

	    req = websocket._req = null;
	    emitErrorAndClose(websocket, err);
	  });

	  req.on('response', (res) => {
	    const location = res.headers.location;
	    const statusCode = res.statusCode;

	    if (
	      location &&
	      opts.followRedirects &&
	      statusCode >= 300 &&
	      statusCode < 400
	    ) {
	      if (++websocket._redirects > opts.maxRedirects) {
	        abortHandshake(websocket, req, 'Maximum redirects exceeded');
	        return;
	      }

	      req.abort();

	      let addr;

	      try {
	        addr = new URL(location, address);
	      } catch (e) {
	        const err = new SyntaxError(`Invalid URL: ${location}`);
	        emitErrorAndClose(websocket, err);
	        return;
	      }

	      initAsClient(websocket, addr, protocols, options);
	    } else if (!websocket.emit('unexpected-response', req, res)) {
	      abortHandshake(
	        websocket,
	        req,
	        `Unexpected server response: ${res.statusCode}`
	      );
	    }
	  });

	  req.on('upgrade', (res, socket, head) => {
	    websocket.emit('upgrade', res);

	    //
	    // The user may have closed the connection from a listener of the
	    // `'upgrade'` event.
	    //
	    if (websocket.readyState !== WebSocket.CONNECTING) return;

	    req = websocket._req = null;

	    const upgrade = res.headers.upgrade;

	    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
	      abortHandshake(websocket, socket, 'Invalid Upgrade header');
	      return;
	    }

	    const digest = createHash('sha1')
	      .update(key + GUID)
	      .digest('base64');

	    if (res.headers['sec-websocket-accept'] !== digest) {
	      abortHandshake(websocket, socket, 'Invalid Sec-WebSocket-Accept header');
	      return;
	    }

	    const serverProt = res.headers['sec-websocket-protocol'];
	    let protError;

	    if (serverProt !== undefined) {
	      if (!protocolSet.size) {
	        protError = 'Server sent a subprotocol but none was requested';
	      } else if (!protocolSet.has(serverProt)) {
	        protError = 'Server sent an invalid subprotocol';
	      }
	    } else if (protocolSet.size) {
	      protError = 'Server sent no subprotocol';
	    }

	    if (protError) {
	      abortHandshake(websocket, socket, protError);
	      return;
	    }

	    if (serverProt) websocket._protocol = serverProt;

	    const secWebSocketExtensions = res.headers['sec-websocket-extensions'];

	    if (secWebSocketExtensions !== undefined) {
	      if (!perMessageDeflate) {
	        const message =
	          'Server sent a Sec-WebSocket-Extensions header but no extension ' +
	          'was requested';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      let extensions;

	      try {
	        extensions = parse(secWebSocketExtensions);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Extensions header';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      const extensionNames = Object.keys(extensions);

	      if (
	        extensionNames.length !== 1 ||
	        extensionNames[0] !== PerMessageDeflate.extensionName
	      ) {
	        const message = 'Server indicated an extension that was not requested';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      try {
	        perMessageDeflate.accept(extensions[PerMessageDeflate.extensionName]);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Extensions header';
	        abortHandshake(websocket, socket, message);
	        return;
	      }

	      websocket._extensions[PerMessageDeflate.extensionName] =
	        perMessageDeflate;
	    }

	    websocket.setSocket(socket, head, {
	      allowSynchronousEvents: opts.allowSynchronousEvents,
	      generateMask: opts.generateMask,
	      maxBufferedChunks: opts.maxBufferedChunks,
	      maxFragments: opts.maxFragments,
	      maxPayload: opts.maxPayload,
	      skipUTF8Validation: opts.skipUTF8Validation
	    });
	  });

	  if (opts.finishRequest) {
	    opts.finishRequest(req, websocket);
	  } else {
	    req.end();
	  }
	}

	/**
	 * Emit the `'error'` and `'close'` events.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {Error} The error to emit
	 * @private
	 */
	function emitErrorAndClose(websocket, err) {
	  websocket._readyState = WebSocket.CLOSING;
	  //
	  // The following assignment is practically useless and is done only for
	  // consistency.
	  //
	  websocket._errorEmitted = true;
	  websocket.emit('error', err);
	  websocket.emitClose();
	}

	/**
	 * Create a `net.Socket` and initiate a connection.
	 *
	 * @param {Object} options Connection options
	 * @return {net.Socket} The newly created socket used to start the connection
	 * @private
	 */
	function netConnect(options) {
	  options.path = options.socketPath;
	  return net.connect(options);
	}

	/**
	 * Create a `tls.TLSSocket` and initiate a connection.
	 *
	 * @param {Object} options Connection options
	 * @return {tls.TLSSocket} The newly created socket used to start the connection
	 * @private
	 */
	function tlsConnect(options) {
	  options.path = undefined;

	  if (!options.servername && options.servername !== '') {
	    options.servername = net.isIP(options.host) ? '' : options.host;
	  }

	  return tls.connect(options);
	}

	/**
	 * Abort the handshake and emit an error.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {(http.ClientRequest|net.Socket|tls.Socket)} stream The request to
	 *     abort or the socket to destroy
	 * @param {String} message The error message
	 * @private
	 */
	function abortHandshake(websocket, stream, message) {
	  websocket._readyState = WebSocket.CLOSING;

	  const err = new Error(message);
	  Error.captureStackTrace(err, abortHandshake);

	  if (stream.setHeader) {
	    stream[kAborted] = true;
	    stream.abort();

	    if (stream.socket && !stream.socket.destroyed) {
	      //
	      // On Node.js >= 14.3.0 `request.abort()` does not destroy the socket if
	      // called after the request completed. See
	      // https://github.com/websockets/ws/issues/1869.
	      //
	      stream.socket.destroy();
	    }

	    process.nextTick(emitErrorAndClose, websocket, err);
	  } else {
	    stream.destroy(err);
	    stream.once('error', websocket.emit.bind(websocket, 'error'));
	    stream.once('close', websocket.emitClose.bind(websocket));
	  }
	}

	/**
	 * Handle cases where the `ping()`, `pong()`, or `send()` methods are called
	 * when the `readyState` attribute is `CLOSING` or `CLOSED`.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @param {*} [data] The data to send
	 * @param {Function} [cb] Callback
	 * @private
	 */
	function sendAfterClose(websocket, data, cb) {
	  if (data) {
	    const length = isBlob(data) ? data.size : toBuffer(data).length;

	    //
	    // The `_bufferedAmount` property is used only when the peer is a client and
	    // the opening handshake fails. Under these circumstances, in fact, the
	    // `setSocket()` method is not called, so the `_socket` and `_sender`
	    // properties are set to `null`.
	    //
	    if (websocket._socket) websocket._sender._bufferedBytes += length;
	    else websocket._bufferedAmount += length;
	  }

	  if (cb) {
	    const err = new Error(
	      `WebSocket is not open: readyState ${websocket.readyState} ` +
	        `(${readyStates[websocket.readyState]})`
	    );
	    process.nextTick(cb, err);
	  }
	}

	/**
	 * The listener of the `Receiver` `'conclude'` event.
	 *
	 * @param {Number} code The status code
	 * @param {Buffer} reason The reason for closing
	 * @private
	 */
	function receiverOnConclude(code, reason) {
	  const websocket = this[kWebSocket];

	  websocket._closeFrameReceived = true;
	  websocket._closeMessage = reason;
	  websocket._closeCode = code;

	  if (websocket._socket[kWebSocket] === undefined) return;

	  websocket._socket.removeListener('data', socketOnData);
	  process.nextTick(resume, websocket._socket);

	  if (code === 1005) websocket.close();
	  else websocket.close(code, reason);
	}

	/**
	 * The listener of the `Receiver` `'drain'` event.
	 *
	 * @private
	 */
	function receiverOnDrain() {
	  const websocket = this[kWebSocket];

	  if (!websocket.isPaused) websocket._socket.resume();
	}

	/**
	 * The listener of the `Receiver` `'error'` event.
	 *
	 * @param {(RangeError|Error)} err The emitted error
	 * @private
	 */
	function receiverOnError(err) {
	  const websocket = this[kWebSocket];

	  if (websocket._socket[kWebSocket] !== undefined) {
	    websocket._socket.removeListener('data', socketOnData);

	    //
	    // On Node.js < 14.0.0 the `'error'` event is emitted synchronously. See
	    // https://github.com/websockets/ws/issues/1940.
	    //
	    process.nextTick(resume, websocket._socket);

	    websocket.close(err[kStatusCode]);
	  }

	  if (!websocket._errorEmitted) {
	    websocket._errorEmitted = true;
	    websocket.emit('error', err);
	  }
	}

	/**
	 * The listener of the `Receiver` `'finish'` event.
	 *
	 * @private
	 */
	function receiverOnFinish() {
	  this[kWebSocket].emitClose();
	}

	/**
	 * The listener of the `Receiver` `'message'` event.
	 *
	 * @param {Buffer|ArrayBuffer|Buffer[])} data The message
	 * @param {Boolean} isBinary Specifies whether the message is binary or not
	 * @private
	 */
	function receiverOnMessage(data, isBinary) {
	  this[kWebSocket].emit('message', data, isBinary);
	}

	/**
	 * The listener of the `Receiver` `'ping'` event.
	 *
	 * @param {Buffer} data The data included in the ping frame
	 * @private
	 */
	function receiverOnPing(data) {
	  const websocket = this[kWebSocket];

	  if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
	  websocket.emit('ping', data);
	}

	/**
	 * The listener of the `Receiver` `'pong'` event.
	 *
	 * @param {Buffer} data The data included in the pong frame
	 * @private
	 */
	function receiverOnPong(data) {
	  this[kWebSocket].emit('pong', data);
	}

	/**
	 * Resume a readable stream
	 *
	 * @param {Readable} stream The readable stream
	 * @private
	 */
	function resume(stream) {
	  stream.resume();
	}

	/**
	 * The `Sender` error event handler.
	 *
	 * @param {Error} The error
	 * @private
	 */
	function senderOnError(err) {
	  const websocket = this[kWebSocket];

	  if (websocket.readyState === WebSocket.CLOSED) return;
	  if (websocket.readyState === WebSocket.OPEN) {
	    websocket._readyState = WebSocket.CLOSING;
	    setCloseTimer(websocket);
	  }

	  //
	  // `socket.end()` is used instead of `socket.destroy()` to allow the other
	  // peer to finish sending queued data. There is no need to set a timer here
	  // because `CLOSING` means that it is already set or not needed.
	  //
	  this._socket.end();

	  if (!websocket._errorEmitted) {
	    websocket._errorEmitted = true;
	    websocket.emit('error', err);
	  }
	}

	/**
	 * Set a timer to destroy the underlying raw socket of a WebSocket.
	 *
	 * @param {WebSocket} websocket The WebSocket instance
	 * @private
	 */
	function setCloseTimer(websocket) {
	  websocket._closeTimer = setTimeout(
	    websocket._socket.destroy.bind(websocket._socket),
	    websocket._closeTimeout
	  );
	}

	/**
	 * The listener of the socket `'close'` event.
	 *
	 * @private
	 */
	function socketOnClose() {
	  const websocket = this[kWebSocket];

	  this.removeListener('close', socketOnClose);
	  this.removeListener('data', socketOnData);
	  this.removeListener('end', socketOnEnd);

	  websocket._readyState = WebSocket.CLOSING;

	  //
	  // The close frame might not have been received or the `'end'` event emitted,
	  // for example, if the socket was destroyed due to an error. Ensure that the
	  // `receiver` stream is closed after writing any remaining buffered data to
	  // it. If the readable side of the socket is in flowing mode then there is no
	  // buffered data as everything has been already written. If instead, the
	  // socket is paused, any possible buffered data will be read as a single
	  // chunk.
	  //
	  if (
	    !this._readableState.endEmitted &&
	    !websocket._closeFrameReceived &&
	    !websocket._receiver._writableState.errorEmitted &&
	    this._readableState.length !== 0
	  ) {
	    const chunk = this.read(this._readableState.length);

	    websocket._receiver.write(chunk);
	  }

	  websocket._receiver.end();

	  this[kWebSocket] = undefined;

	  clearTimeout(websocket._closeTimer);

	  if (
	    websocket._receiver._writableState.finished ||
	    websocket._receiver._writableState.errorEmitted
	  ) {
	    websocket.emitClose();
	  } else {
	    websocket._receiver.on('error', receiverOnFinish);
	    websocket._receiver.on('finish', receiverOnFinish);
	  }
	}

	/**
	 * The listener of the socket `'data'` event.
	 *
	 * @param {Buffer} chunk A chunk of data
	 * @private
	 */
	function socketOnData(chunk) {
	  if (!this[kWebSocket]._receiver.write(chunk)) {
	    this.pause();
	  }
	}

	/**
	 * The listener of the socket `'end'` event.
	 *
	 * @private
	 */
	function socketOnEnd() {
	  const websocket = this[kWebSocket];

	  websocket._readyState = WebSocket.CLOSING;
	  websocket._receiver.end();
	  this.end();
	}

	/**
	 * The listener of the socket `'error'` event.
	 *
	 * @private
	 */
	function socketOnError() {
	  const websocket = this[kWebSocket];

	  this.removeListener('error', socketOnError);
	  this.on('error', NOOP);

	  if (websocket) {
	    websocket._readyState = WebSocket.CLOSING;
	    this.destroy();
	  }
	}
	return websocket;
}

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^WebSocket$" }] */

var stream;
var hasRequiredStream;

function requireStream () {
	if (hasRequiredStream) return stream;
	hasRequiredStream = 1;

	requireWebsocket();
	const { Duplex } = require$$0$2;

	/**
	 * Emits the `'close'` event on a stream.
	 *
	 * @param {Duplex} stream The stream.
	 * @private
	 */
	function emitClose(stream) {
	  stream.emit('close');
	}

	/**
	 * The listener of the `'end'` event.
	 *
	 * @private
	 */
	function duplexOnEnd() {
	  if (!this.destroyed && this._writableState.finished) {
	    this.destroy();
	  }
	}

	/**
	 * The listener of the `'error'` event.
	 *
	 * @param {Error} err The error
	 * @private
	 */
	function duplexOnError(err) {
	  this.removeListener('error', duplexOnError);
	  this.destroy();
	  if (this.listenerCount('error') === 0) {
	    // Do not suppress the throwing behavior.
	    this.emit('error', err);
	  }
	}

	/**
	 * Wraps a `WebSocket` in a duplex stream.
	 *
	 * @param {WebSocket} ws The `WebSocket` to wrap
	 * @param {Object} [options] The options for the `Duplex` constructor
	 * @return {Duplex} The duplex stream
	 * @public
	 */
	function createWebSocketStream(ws, options) {
	  let terminateOnDestroy = true;

	  const duplex = new Duplex({
	    ...options,
	    autoDestroy: false,
	    emitClose: false,
	    objectMode: false,
	    writableObjectMode: false
	  });

	  ws.on('message', function message(msg, isBinary) {
	    const data =
	      !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;

	    if (!duplex.push(data)) ws.pause();
	  });

	  ws.once('error', function error(err) {
	    if (duplex.destroyed) return;

	    // Prevent `ws.terminate()` from being called by `duplex._destroy()`.
	    //
	    // - If the `'error'` event is emitted before the `'open'` event, then
	    //   `ws.terminate()` is a noop as no socket is assigned.
	    // - Otherwise, the error is re-emitted by the listener of the `'error'`
	    //   event of the `Receiver` object. The listener already closes the
	    //   connection by calling `ws.close()`. This allows a close frame to be
	    //   sent to the other peer. If `ws.terminate()` is called right after this,
	    //   then the close frame might not be sent.
	    terminateOnDestroy = false;
	    duplex.destroy(err);
	  });

	  ws.once('close', function close() {
	    if (duplex.destroyed) return;

	    duplex.push(null);
	  });

	  duplex._destroy = function (err, callback) {
	    if (ws.readyState === ws.CLOSED) {
	      callback(err);
	      process.nextTick(emitClose, duplex);
	      return;
	    }

	    let called = false;

	    ws.once('error', function error(err) {
	      called = true;
	      callback(err);
	    });

	    ws.once('close', function close() {
	      if (!called) callback(err);
	      process.nextTick(emitClose, duplex);
	    });

	    if (terminateOnDestroy) ws.terminate();
	  };

	  duplex._final = function (callback) {
	    if (ws.readyState === ws.CONNECTING) {
	      ws.once('open', function open() {
	        duplex._final(callback);
	      });
	      return;
	    }

	    // If the value of the `_socket` property is `null` it means that `ws` is a
	    // client websocket and the handshake failed. In fact, when this happens, a
	    // socket is never assigned to the websocket. Wait for the `'error'` event
	    // that will be emitted by the websocket.
	    if (ws._socket === null) return;

	    if (ws._socket._writableState.finished) {
	      callback();
	      if (duplex._readableState.endEmitted) duplex.destroy();
	    } else {
	      ws._socket.once('finish', function finish() {
	        // `duplex` is not destroyed here because the `'end'` event will be
	        // emitted on `duplex` after this `'finish'` event. The EOF signaling
	        // `null` chunk is, in fact, pushed when the websocket emits `'close'`.
	        callback();
	      });
	      ws.close();
	    }
	  };

	  duplex._read = function () {
	    if (ws.isPaused) ws.resume();
	  };

	  duplex._write = function (chunk, encoding, callback) {
	    if (ws.readyState === ws.CONNECTING) {
	      ws.once('open', function open() {
	        duplex._write(chunk, encoding, callback);
	      });
	      return;
	    }

	    ws.send(chunk, callback);
	  };

	  duplex.on('end', duplexOnEnd);
	  duplex.on('error', duplexOnError);
	  return duplex;
	}

	stream = createWebSocketStream;
	return stream;
}

requireStream();

requireExtension();

requirePermessageDeflate();

requireReceiver();

requireSender();

var subprotocol;
var hasRequiredSubprotocol;

function requireSubprotocol () {
	if (hasRequiredSubprotocol) return subprotocol;
	hasRequiredSubprotocol = 1;

	const { tokenChars } = requireValidation();

	/**
	 * Parses the `Sec-WebSocket-Protocol` header into a set of subprotocol names.
	 *
	 * @param {String} header The field value of the header
	 * @return {Set} The subprotocol names
	 * @public
	 */
	function parse(header) {
	  const protocols = new Set();
	  let start = -1;
	  let end = -1;
	  let i = 0;

	  for (i; i < header.length; i++) {
	    const code = header.charCodeAt(i);

	    if (end === -1 && tokenChars[code] === 1) {
	      if (start === -1) start = i;
	    } else if (
	      i !== 0 &&
	      (code === 0x20 /* ' ' */ || code === 0x09) /* '\t' */
	    ) {
	      if (end === -1 && start !== -1) end = i;
	    } else if (code === 0x2c /* ',' */) {
	      if (start === -1) {
	        throw new SyntaxError(`Unexpected character at index ${i}`);
	      }

	      if (end === -1) end = i;

	      const protocol = header.slice(start, end);

	      if (protocols.has(protocol)) {
	        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
	      }

	      protocols.add(protocol);
	      start = end = -1;
	    } else {
	      throw new SyntaxError(`Unexpected character at index ${i}`);
	    }
	  }

	  if (start === -1 || end !== -1) {
	    throw new SyntaxError('Unexpected end of input');
	  }

	  const protocol = header.slice(start, i);

	  if (protocols.has(protocol)) {
	    throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
	  }

	  protocols.add(protocol);
	  return protocols;
	}

	subprotocol = { parse };
	return subprotocol;
}

requireSubprotocol();

var websocketExports = requireWebsocket();
var WebSocket = /*@__PURE__*/getDefaultExportFromCjs(websocketExports);

/* eslint no-unused-vars: ["error", { "varsIgnorePattern": "^Duplex$", "caughtErrors": "none" }] */

var websocketServer;
var hasRequiredWebsocketServer;

function requireWebsocketServer () {
	if (hasRequiredWebsocketServer) return websocketServer;
	hasRequiredWebsocketServer = 1;

	const EventEmitter = require$$0$3;
	const http = require$$2$1;
	const { Duplex } = require$$0$2;
	const { createHash } = require$$1;

	const extension = requireExtension();
	const PerMessageDeflate = requirePermessageDeflate();
	const subprotocol = requireSubprotocol();
	const WebSocket = requireWebsocket();
	const { CLOSE_TIMEOUT, GUID, kWebSocket } = requireConstants();

	const keyRegex = /^[+/0-9A-Za-z]{22}==$/;

	const RUNNING = 0;
	const CLOSING = 1;
	const CLOSED = 2;

	/**
	 * Class representing a WebSocket server.
	 *
	 * @extends EventEmitter
	 */
	class WebSocketServer extends EventEmitter {
	  /**
	   * Create a `WebSocketServer` instance.
	   *
	   * @param {Object} options Configuration options
	   * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
	   *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
	   *     multiple times in the same tick
	   * @param {Boolean} [options.autoPong=true] Specifies whether or not to
	   *     automatically send a pong in response to a ping
	   * @param {Number} [options.backlog=511] The maximum length of the queue of
	   *     pending connections
	   * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
	   *     track clients
	   * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
	   *     wait for the closing handshake to finish after `websocket.close()` is
	   *     called
	   * @param {Function} [options.handleProtocols] A hook to handle protocols
	   * @param {String} [options.host] The hostname where to bind the server
	   * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
	   *     buffered data chunks
	   * @param {Number} [options.maxFragments=16384] The maximum number of message
	   *     fragments
	   * @param {Number} [options.maxPayload=104857600] The maximum allowed message
	   *     size
	   * @param {Boolean} [options.noServer=false] Enable no server mode
	   * @param {String} [options.path] Accept only connections matching this path
	   * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
	   *     permessage-deflate
	   * @param {Number} [options.port] The port where to bind the server
	   * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
	   *     server to use
	   * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
	   *     not to skip UTF-8 validation for text and close messages
	   * @param {Function} [options.verifyClient] A hook to reject connections
	   * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
	   *     class to use. It must be the `WebSocket` class or class that extends it
	   * @param {Function} [callback] A listener for the `listening` event
	   */
	  constructor(options, callback) {
	    super();

	    options = {
	      allowSynchronousEvents: true,
	      autoPong: true,
	      maxBufferedChunks: 256 * 1024,
	      maxFragments: 16 * 1024,
	      maxPayload: 100 * 1024 * 1024,
	      skipUTF8Validation: false,
	      perMessageDeflate: false,
	      handleProtocols: null,
	      clientTracking: true,
	      closeTimeout: CLOSE_TIMEOUT,
	      verifyClient: null,
	      noServer: false,
	      backlog: null, // use default (511 as implemented in net.js)
	      server: null,
	      host: null,
	      path: null,
	      port: null,
	      WebSocket,
	      ...options
	    };

	    if (
	      (options.port == null && !options.server && !options.noServer) ||
	      (options.port != null && (options.server || options.noServer)) ||
	      (options.server && options.noServer)
	    ) {
	      throw new TypeError(
	        'One and only one of the "port", "server", or "noServer" options ' +
	          'must be specified'
	      );
	    }

	    if (options.port != null) {
	      this._server = http.createServer((req, res) => {
	        const body = http.STATUS_CODES[426];

	        res.writeHead(426, {
	          'Content-Length': body.length,
	          'Content-Type': 'text/plain'
	        });
	        res.end(body);
	      });
	      this._server.listen(
	        options.port,
	        options.host,
	        options.backlog,
	        callback
	      );
	    } else if (options.server) {
	      this._server = options.server;
	    }

	    if (this._server) {
	      const emitConnection = this.emit.bind(this, 'connection');

	      this._removeListeners = addListeners(this._server, {
	        listening: this.emit.bind(this, 'listening'),
	        error: this.emit.bind(this, 'error'),
	        upgrade: (req, socket, head) => {
	          this.handleUpgrade(req, socket, head, emitConnection);
	        }
	      });
	    }

	    if (options.perMessageDeflate === true) options.perMessageDeflate = {};
	    if (options.clientTracking) {
	      this.clients = new Set();
	      this._shouldEmitClose = false;
	    }

	    this.options = options;
	    this._state = RUNNING;
	  }

	  /**
	   * Returns the bound address, the address family name, and port of the server
	   * as reported by the operating system if listening on an IP socket.
	   * If the server is listening on a pipe or UNIX domain socket, the name is
	   * returned as a string.
	   *
	   * @return {(Object|String|null)} The address of the server
	   * @public
	   */
	  address() {
	    if (this.options.noServer) {
	      throw new Error('The server is operating in "noServer" mode');
	    }

	    if (!this._server) return null;
	    return this._server.address();
	  }

	  /**
	   * Stop the server from accepting new connections and emit the `'close'` event
	   * when all existing connections are closed.
	   *
	   * @param {Function} [cb] A one-time listener for the `'close'` event
	   * @public
	   */
	  close(cb) {
	    if (this._state === CLOSED) {
	      if (cb) {
	        this.once('close', () => {
	          cb(new Error('The server is not running'));
	        });
	      }

	      process.nextTick(emitClose, this);
	      return;
	    }

	    if (cb) this.once('close', cb);

	    if (this._state === CLOSING) return;
	    this._state = CLOSING;

	    if (this.options.noServer || this.options.server) {
	      if (this._server) {
	        this._removeListeners();
	        this._removeListeners = this._server = null;
	      }

	      if (this.clients) {
	        if (!this.clients.size) {
	          process.nextTick(emitClose, this);
	        } else {
	          this._shouldEmitClose = true;
	        }
	      } else {
	        process.nextTick(emitClose, this);
	      }
	    } else {
	      const server = this._server;

	      this._removeListeners();
	      this._removeListeners = this._server = null;

	      //
	      // The HTTP/S server was created internally. Close it, and rely on its
	      // `'close'` event.
	      //
	      server.close(() => {
	        emitClose(this);
	      });
	    }
	  }

	  /**
	   * See if a given request should be handled by this server instance.
	   *
	   * @param {http.IncomingMessage} req Request object to inspect
	   * @return {Boolean} `true` if the request is valid, else `false`
	   * @public
	   */
	  shouldHandle(req) {
	    if (this.options.path) {
	      const index = req.url.indexOf('?');
	      const pathname = index !== -1 ? req.url.slice(0, index) : req.url;

	      if (pathname !== this.options.path) return false;
	    }

	    return true;
	  }

	  /**
	   * Handle a HTTP Upgrade request.
	   *
	   * @param {http.IncomingMessage} req The request object
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Function} cb Callback
	   * @public
	   */
	  handleUpgrade(req, socket, head, cb) {
	    socket.on('error', socketOnError);

	    const key = req.headers['sec-websocket-key'];
	    const upgrade = req.headers.upgrade;
	    const version = +req.headers['sec-websocket-version'];

	    if (req.method !== 'GET') {
	      const message = 'Invalid HTTP method';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
	      return;
	    }

	    if (upgrade === undefined || upgrade.toLowerCase() !== 'websocket') {
	      const message = 'Invalid Upgrade header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	      return;
	    }

	    if (key === undefined || !keyRegex.test(key)) {
	      const message = 'Missing or invalid Sec-WebSocket-Key header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	      return;
	    }

	    if (version !== 13 && version !== 8) {
	      const message = 'Missing or invalid Sec-WebSocket-Version header';
	      abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
	        'Sec-WebSocket-Version': '13, 8'
	      });
	      return;
	    }

	    if (!this.shouldHandle(req)) {
	      abortHandshake(socket, 400);
	      return;
	    }

	    const secWebSocketProtocol = req.headers['sec-websocket-protocol'];
	    let protocols = new Set();

	    if (secWebSocketProtocol !== undefined) {
	      try {
	        protocols = subprotocol.parse(secWebSocketProtocol);
	      } catch (err) {
	        const message = 'Invalid Sec-WebSocket-Protocol header';
	        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	        return;
	      }
	    }

	    const secWebSocketExtensions = req.headers['sec-websocket-extensions'];
	    const extensions = {};

	    if (
	      this.options.perMessageDeflate &&
	      secWebSocketExtensions !== undefined
	    ) {
	      const perMessageDeflate = new PerMessageDeflate({
	        ...this.options.perMessageDeflate,
	        isServer: true,
	        maxPayload: this.options.maxPayload
	      });

	      try {
	        const offers = extension.parse(secWebSocketExtensions);

	        if (offers[PerMessageDeflate.extensionName]) {
	          perMessageDeflate.accept(offers[PerMessageDeflate.extensionName]);
	          extensions[PerMessageDeflate.extensionName] = perMessageDeflate;
	        }
	      } catch (err) {
	        const message =
	          'Invalid or unacceptable Sec-WebSocket-Extensions header';
	        abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
	        return;
	      }
	    }

	    //
	    // Optionally call external client verification handler.
	    //
	    if (this.options.verifyClient) {
	      const info = {
	        origin:
	          req.headers[`${version === 8 ? 'sec-websocket-origin' : 'origin'}`],
	        secure: !!(req.socket.authorized || req.socket.encrypted),
	        req
	      };

	      if (this.options.verifyClient.length === 2) {
	        this.options.verifyClient(info, (verified, code, message, headers) => {
	          if (!verified) {
	            return abortHandshake(socket, code || 401, message, headers);
	          }

	          this.completeUpgrade(
	            extensions,
	            key,
	            protocols,
	            req,
	            socket,
	            head,
	            cb
	          );
	        });
	        return;
	      }

	      if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
	    }

	    this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
	  }

	  /**
	   * Upgrade the connection to WebSocket.
	   *
	   * @param {Object} extensions The accepted extensions
	   * @param {String} key The value of the `Sec-WebSocket-Key` header
	   * @param {Set} protocols The subprotocols
	   * @param {http.IncomingMessage} req The request object
	   * @param {Duplex} socket The network socket between the server and client
	   * @param {Buffer} head The first packet of the upgraded stream
	   * @param {Function} cb Callback
	   * @throws {Error} If called more than once with the same socket
	   * @private
	   */
	  completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
	    //
	    // Destroy the socket if the client has already sent a FIN packet.
	    //
	    if (!socket.readable || !socket.writable) return socket.destroy();

	    if (socket[kWebSocket]) {
	      throw new Error(
	        'server.handleUpgrade() was called more than once with the same ' +
	          'socket, possibly due to a misconfiguration'
	      );
	    }

	    if (this._state > RUNNING) return abortHandshake(socket, 503);

	    const digest = createHash('sha1')
	      .update(key + GUID)
	      .digest('base64');

	    const headers = [
	      'HTTP/1.1 101 Switching Protocols',
	      'Upgrade: websocket',
	      'Connection: Upgrade',
	      `Sec-WebSocket-Accept: ${digest}`
	    ];

	    const ws = new this.options.WebSocket(null, undefined, this.options);

	    if (protocols.size) {
	      //
	      // Optionally call external protocol selection handler.
	      //
	      const protocol = this.options.handleProtocols
	        ? this.options.handleProtocols(protocols, req)
	        : protocols.values().next().value;

	      if (protocol) {
	        headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
	        ws._protocol = protocol;
	      }
	    }

	    if (extensions[PerMessageDeflate.extensionName]) {
	      const params = extensions[PerMessageDeflate.extensionName].params;
	      const value = extension.format({
	        [PerMessageDeflate.extensionName]: [params]
	      });
	      headers.push(`Sec-WebSocket-Extensions: ${value}`);
	      ws._extensions = extensions;
	    }

	    //
	    // Allow external modification/inspection of handshake headers.
	    //
	    this.emit('headers', headers, req);

	    socket.write(headers.concat('\r\n').join('\r\n'));
	    socket.removeListener('error', socketOnError);

	    ws.setSocket(socket, head, {
	      allowSynchronousEvents: this.options.allowSynchronousEvents,
	      maxBufferedChunks: this.options.maxBufferedChunks,
	      maxFragments: this.options.maxFragments,
	      maxPayload: this.options.maxPayload,
	      skipUTF8Validation: this.options.skipUTF8Validation
	    });

	    if (this.clients) {
	      this.clients.add(ws);
	      ws.on('close', () => {
	        this.clients.delete(ws);

	        if (this._shouldEmitClose && !this.clients.size) {
	          process.nextTick(emitClose, this);
	        }
	      });
	    }

	    cb(ws, req);
	  }
	}

	websocketServer = WebSocketServer;

	/**
	 * Add event listeners on an `EventEmitter` using a map of <event, listener>
	 * pairs.
	 *
	 * @param {EventEmitter} server The event emitter
	 * @param {Object.<String, Function>} map The listeners to add
	 * @return {Function} A function that will remove the added listeners when
	 *     called
	 * @private
	 */
	function addListeners(server, map) {
	  for (const event of Object.keys(map)) server.on(event, map[event]);

	  return function removeListeners() {
	    for (const event of Object.keys(map)) {
	      server.removeListener(event, map[event]);
	    }
	  };
	}

	/**
	 * Emit a `'close'` event on an `EventEmitter`.
	 *
	 * @param {EventEmitter} server The event emitter
	 * @private
	 */
	function emitClose(server) {
	  server._state = CLOSED;
	  server.emit('close');
	}

	/**
	 * Handle socket errors.
	 *
	 * @private
	 */
	function socketOnError() {
	  this.destroy();
	}

	/**
	 * Close the connection when preconditions are not fulfilled.
	 *
	 * @param {Duplex} socket The socket of the upgrade request
	 * @param {Number} code The HTTP response status code
	 * @param {String} [message] The HTTP response body
	 * @param {Object} [headers] Additional HTTP response headers
	 * @private
	 */
	function abortHandshake(socket, code, message, headers) {
	  //
	  // The socket is writable unless the user destroyed or ended it before calling
	  // `server.handleUpgrade()` or in the `verifyClient` function, which is a user
	  // error. Handling this does not make much sense as the worst that can happen
	  // is that some of the data written by the user might be discarded due to the
	  // call to `socket.end()` below, which triggers an `'error'` event that in
	  // turn causes the socket to be destroyed.
	  //
	  message = message || http.STATUS_CODES[code];
	  headers = {
	    Connection: 'close',
	    'Content-Type': 'text/html',
	    'Content-Length': Buffer.byteLength(message),
	    ...headers
	  };

	  socket.once('finish', socket.destroy);

	  socket.end(
	    `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r\n` +
	      Object.keys(headers)
	        .map((h) => `${h}: ${headers[h]}`)
	        .join('\r\n') +
	      '\r\n\r\n' +
	      message
	  );
	}

	/**
	 * Emit a `'wsClientError'` event on a `WebSocketServer` if there is at least
	 * one listener for it, otherwise call `abortHandshake()`.
	 *
	 * @param {WebSocketServer} server The WebSocket server
	 * @param {http.IncomingMessage} req The request object
	 * @param {Duplex} socket The socket of the upgrade request
	 * @param {Number} code The HTTP response status code
	 * @param {String} message The HTTP response body
	 * @param {Object} [headers] The HTTP response headers
	 * @private
	 */
	function abortHandshakeOrEmitwsClientError(
	  server,
	  req,
	  socket,
	  code,
	  message,
	  headers
	) {
	  if (server.listenerCount('wsClientError')) {
	    const err = new Error(message);
	    Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);

	    server.emit('wsClientError', err, socket, req);
	  } else {
	    abortHandshake(socket, code, message, headers);
	  }
	}
	return websocketServer;
}

requireWebsocketServer();

/**!
 * @author Elgato
 * @module elgato/streamdeck
 * @license MIT
 * @copyright Copyright (c) Corsair Memory Inc.
 */
/**
 * Stream Deck device types.
 */
var DeviceType;
(function (DeviceType) {
    /**
     * Stream Deck, comprised of 15 customizable LCD keys in a 5 x 3 layout.
     */
    DeviceType[DeviceType["StreamDeck"] = 0] = "StreamDeck";
    /**
     * Stream Deck Mini, comprised of 6 customizable LCD keys in a 3 x 2 layout.
     */
    DeviceType[DeviceType["StreamDeckMini"] = 1] = "StreamDeckMini";
    /**
     * Stream Deck XL, comprised of 32 customizable LCD keys in an 8 x 4 layout.
     */
    DeviceType[DeviceType["StreamDeckXL"] = 2] = "StreamDeckXL";
    /**
     * Stream Deck Mobile, for iOS and Android.
     */
    DeviceType[DeviceType["StreamDeckMobile"] = 3] = "StreamDeckMobile";
    /**
     * Corsair G Keys, available on select Corsair keyboards.
     */
    DeviceType[DeviceType["CorsairGKeys"] = 4] = "CorsairGKeys";
    /**
     * Stream Deck Pedal, comprised of 3 customizable pedals.
     */
    DeviceType[DeviceType["StreamDeckPedal"] = 5] = "StreamDeckPedal";
    /**
     * Corsair Voyager laptop, comprising 10 buttons in a horizontal line above the keyboard.
     */
    DeviceType[DeviceType["CorsairVoyager"] = 6] = "CorsairVoyager";
    /**
     * Stream Deck +, comprised of 8 customizable LCD keys in a 4 x 2 layout, a touch strip, and 4 dials.
     */
    DeviceType[DeviceType["StreamDeckPlus"] = 7] = "StreamDeckPlus";
    /**
     * SCUF controller G keys, available on select SCUF controllers, for example SCUF Envision.
     */
    DeviceType[DeviceType["SCUFController"] = 8] = "SCUFController";
    /**
     * Stream Deck Neo, comprised of 8 customizable LCD keys in a 4 x 2 layout, an info bar, and 2 touch points for page navigation.
     */
    DeviceType[DeviceType["StreamDeckNeo"] = 9] = "StreamDeckNeo";
    /**
     * Stream Deck Studio, comprised of 32 customizable LCD keys in a 16 x 2 layout, and 2 dials (1 on either side).
     */
    DeviceType[DeviceType["StreamDeckStudio"] = 10] = "StreamDeckStudio";
    /**
     * Virtual Stream Deck, comprised of 1 to 64 action (on-screen) on a scalable canvas, with a maximum layout of 8 x 8.
     */
    DeviceType[DeviceType["VirtualStreamDeck"] = 11] = "VirtualStreamDeck";
    /**
     * High-performance gaming keyboard, with a built-in Stream Deck comprised of 12 customizable LCD keys in a 3 x 4 layout, an LCD screen, and 2 dials.
     */
    DeviceType[DeviceType["Galleon100SD"] = 12] = "Galleon100SD";
    /**
     * Stream Deck + XL, comprised of 36 customizable LCD keys in a 9 x 4 layout, a touch strip, and 6 dials.
     */
    DeviceType[DeviceType["StreamDeckPlusXL"] = 13] = "StreamDeckPlusXL";
})(DeviceType || (DeviceType = {}));

/**
 * List of available types that can be applied to {@link Bar} and {@link GBar} to determine their style.
 */
var BarSubType;
(function (BarSubType) {
    /**
     * Rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Rectangle"] = 0] = "Rectangle";
    /**
     * Rectangle bar; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}.
     * @example
     * // Value is 2, range is 1-10.
     * // [  ███     ]
     * @example
     * // Value is 10, range is 1-10.
     * // [     █████]
     */
    BarSubType[BarSubType["DoubleRectangle"] = 1] = "DoubleRectangle";
    /**
     * Trapezoid bar, represented as a right-angle triangle; the bar fills from left to right, determined by the {@link Bar.value}, similar to a volume meter.
     */
    BarSubType[BarSubType["Trapezoid"] = 2] = "Trapezoid";
    /**
     * Trapezoid bar, represented by two right-angle triangles; the bar fills outwards from the centre of the bar, determined by the {@link Bar.value}. See {@link BarSubType.DoubleRectangle}.
     */
    BarSubType[BarSubType["DoubleTrapezoid"] = 3] = "DoubleTrapezoid";
    /**
     * Rounded rectangle bar; the bar fills from left to right, determined by the {@link Bar.value}, similar to a standard progress bar.
     */
    BarSubType[BarSubType["Groove"] = 4] = "Groove";
})(BarSubType || (BarSubType = {}));

/**
 * Defines the type of argument supplied by Stream Deck.
 */
var RegistrationParameter;
(function (RegistrationParameter) {
    /**
     * Identifies the argument that specifies the web socket port that Stream Deck is listening on.
     */
    RegistrationParameter["Port"] = "-port";
    /**
     * Identifies the argument that supplies information about the Stream Deck and the plugin.
     */
    RegistrationParameter["Info"] = "-info";
    /**
     * Identifies the argument that specifies the unique identifier that can be used when registering the plugin.
     */
    RegistrationParameter["PluginUUID"] = "-pluginUUID";
    /**
     * Identifies the argument that specifies the event to be sent to Stream Deck as part of the registration procedure.
     */
    RegistrationParameter["RegisterEvent"] = "-registerEvent";
})(RegistrationParameter || (RegistrationParameter = {}));

/**
 * Defines the target of a request, i.e. whether the request should update the Stream Deck hardware, Stream Deck software (application), or both, when calling `setImage` and `setState`.
 */
var Target;
(function (Target) {
    /**
     * Hardware and software should be updated as part of the request.
     */
    Target[Target["HardwareAndSoftware"] = 0] = "HardwareAndSoftware";
    /**
     * Hardware only should be updated as part of the request.
     */
    Target[Target["Hardware"] = 1] = "Hardware";
    /**
     * Software only should be updated as part of the request.
     */
    Target[Target["Software"] = 2] = "Software";
})(Target || (Target = {}));

/**
 * Provides information for a version, as parsed from a string denoted as a collection of numbers separated by a period, for example `1.45.2`, `4.0.2.13098`. Parsing is opinionated
 * and strings should strictly conform to the format `{major}[.{minor}[.{patch}[.{build}]]]`; version numbers that form the version are optional, and when `undefined` will default to
 * 0, for example the `minor`, `patch`, or `build` number may be omitted.
 *
 * NB: This implementation should be considered fit-for-purpose, and should be used sparing.
 */
class Version {
    /**
     * Build version number.
     */
    build;
    /**
     * Major version number.
     */
    major;
    /**
     * Minor version number.
     */
    minor;
    /**
     * Patch version number.
     */
    patch;
    /**
     * Initializes a new instance of the {@link Version} class.
     * @param value Value to parse the version from.
     */
    constructor(value) {
        const result = value.match(/^(0|[1-9]\d*)(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?(?:\.(0|[1-9]\d*))?$/);
        if (result === null) {
            throw new Error(`Invalid format; expected "{major}[.{minor}[.{patch}[.{build}]]]" but was "${value}"`);
        }
        [, this.major, this.minor, this.patch, this.build] = [...result.map((value) => parseInt(value) || 0)];
    }
    /**
     * Compares this instance to the {@link other} {@link Version}.
     * @param other The {@link Version} to compare to.
     * @returns `-1` when this instance is less than the {@link other}, `1` when this instance is greater than {@link other}, otherwise `0`.
     */
    compareTo(other) {
        const segments = ({ major, minor, build, patch }) => [major, minor, build, patch];
        const thisSegments = segments(this);
        const otherSegments = segments(other);
        for (let i = 0; i < 4; i++) {
            if (thisSegments[i] < otherSegments[i]) {
                return -1;
            }
            else if (thisSegments[i] > otherSegments[i]) {
                return 1;
            }
        }
        return 0;
    }
    /** @inheritdoc */
    toString() {
        return `${this.major}.${this.minor}`;
    }
}

/**
 * Provides a {@link LogTarget} that logs to the console.
 */
class ConsoleTarget {
    /**
     * @inheritdoc
     */
    write(entry) {
        switch (entry.level) {
            case "error":
                console.error(...entry.data);
                break;
            case "warn":
                console.warn(...entry.data);
                break;
            default:
                console.log(...entry.data);
        }
    }
}

// Remove any dependencies on node.
const EOL = "\n";
/**
 * Creates a new string log entry formatter.
 * @param opts Options that defines the type for the formatter.
 * @returns The string {@link LogEntryFormatter}.
 */
function stringFormatter(opts) {
    {
        return (entry) => {
            const { data, level, scope } = entry;
            let prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} `;
            if (scope) {
                prefix += `${scope}: `;
            }
            return `${prefix}${reduce(data)}`;
        };
    }
}
/**
 * Stringifies the provided data parameters that make up the log entry.
 * @param data Data parameters.
 * @returns The data represented as a single `string`.
 */
function reduce(data) {
    let result = "";
    let previousWasError = false;
    for (const value of data) {
        // When the value is an error, write the stack.
        if (typeof value === "object" && value instanceof Error) {
            result += `${EOL}${value.stack}`;
            previousWasError = true;
            continue;
        }
        // When the previous was an error, write a new line.
        if (previousWasError) {
            result += EOL;
            previousWasError = false;
        }
        result += typeof value === "object" ? JSON.stringify(value) : value;
        result += " ";
    }
    return result.trimEnd();
}

/* eslint-disable @typescript-eslint/sort-type-constituents */
/**
 * Gets the priority of the specified log level as a number; low numbers signify a higher priority.
 * @param level Log level.
 * @returns The priority as a number.
 */
function defcon(level) {
    switch (level) {
        case "error":
            return 0;
        case "warn":
            return 1;
        case "info":
            return 2;
        case "debug":
            return 3;
        case "trace":
        default:
            return 4;
    }
}

/**
 * Logger capable of forwarding messages to a {@link LogTarget}.
 */
class Logger {
    /**
     * Backing field for the {@link Logger.level}.
     */
    #level;
    /**
     * Options that define the loggers behavior.
     */
    #options;
    /**
     * Scope associated with this {@link Logger}.
     */
    #scope;
    /**
     * Initializes a new instance of the {@link Logger} class.
     * @param opts Options that define the loggers behavior.
     */
    constructor(opts) {
        this.#options = { minimumLevel: "trace", ...opts };
        this.#scope = this.#options.scope === undefined || this.#options.scope.trim() === "" ? "" : this.#options.scope;
        if (typeof this.#options.level !== "function") {
            this.setLevel(this.#options.level);
        }
    }
    /**
     * Gets the {@link LogLevel}.
     * @returns The {@link LogLevel}.
     */
    get level() {
        if (this.#level !== undefined) {
            return this.#level;
        }
        return typeof this.#options.level === "function" ? this.#options.level() : this.#options.level;
    }
    /**
     * Creates a scoped logger with the given {@link scope}; logs created by scoped-loggers include their scope to enable their source to be easily identified.
     * @param scope Value that represents the scope of the new logger.
     * @returns The scoped logger, or this instance when {@link scope} is not defined.
     */
    createScope(scope) {
        scope = scope.trim();
        if (scope === "") {
            return this;
        }
        return new Logger({
            ...this.#options,
            level: () => this.level,
            scope: this.#options.scope ? `${this.#options.scope}->${scope}` : scope,
        });
    }
    /**
     * Writes the arguments as a debug log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    debug(...data) {
        return this.write({ level: "debug", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as error log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    error(...data) {
        return this.write({ level: "error", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as an info log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    info(...data) {
        return this.write({ level: "info", data, scope: this.#scope });
    }
    /**
     * Sets the log-level that determines which logs should be written. The specified level will be inherited by all scoped loggers unless they have log-level explicitly defined.
     * @param level The log-level that determines which logs should be written; when `undefined`, the level will be inherited from the parent logger, or default to the environment level.
     * @returns This instance for chaining.
     */
    setLevel(level) {
        if (level !== undefined && defcon(level) > defcon(this.#options.minimumLevel)) {
            this.#level = "info";
        }
        else {
            this.#level = level;
        }
        return this;
    }
    /**
     * Writes the arguments as a trace log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    trace(...data) {
        return this.write({ level: "trace", data, scope: this.#scope });
    }
    /**
     * Writes the arguments as a warning log entry.
     * @param data Message or data to log.
     * @returns This instance for chaining.
     */
    warn(...data) {
        return this.write({ level: "warn", data, scope: this.#scope });
    }
    /**
     * Writes the log entry.
     * @param entry Log entry to write.
     * @returns This instance for chaining.
     */
    write(entry) {
        if (defcon(entry.level) <= defcon(this.level)) {
            this.#options.targets.forEach((t) => t.write(entry));
        }
        return this;
    }
}

/**
 * Provides a {@link LogTarget} capable of logging to a local file system.
 */
class FileTarget {
    /**
     * File path where logs will be written.
     */
    #filePath;
    /**
     * Options that defines how logs should be written to the local file system.
     */
    #options;
    /**
     * Current size of the logs that have been written to the {@link FileTarget.#filePath}.
     */
    #size = 0;
    /**
     * Initializes a new instance of the {@link FileTarget} class.
     * @param options Options that defines how logs should be written to the local file system.
     */
    constructor(options) {
        this.#options = options;
        this.#filePath = this.getLogFilePath();
        this.reIndex();
    }
    /**
     * @inheritdoc
     */
    write(entry) {
        const fd = fs.openSync(this.#filePath, "a");
        try {
            const msg = this.#options.format(entry);
            fs.writeSync(fd, msg + "\n");
            this.#size += msg.length;
        }
        finally {
            fs.closeSync(fd);
        }
        if (this.#size >= this.#options.maxSize) {
            this.reIndex();
            this.#size = 0;
        }
    }
    /**
     * Gets the file path to an indexed log file.
     * @param index Optional index of the log file to be included as part of the file name.
     * @returns File path that represents the indexed log file.
     */
    getLogFilePath(index = 0) {
        return path.join(this.#options.dest, `${this.#options.fileName}.${index}.log`);
    }
    /**
     * Gets the log files associated with this file target, including past and present.
     * @returns Log file entries.
     */
    getLogFiles() {
        const regex = /^\.(\d+)\.log$/;
        return fs
            .readdirSync(this.#options.dest, { withFileTypes: true })
            .reduce((prev, entry) => {
            if (entry.isDirectory() || entry.name.indexOf(this.#options.fileName) < 0) {
                return prev;
            }
            const match = entry.name.substring(this.#options.fileName.length).match(regex);
            if (match?.length !== 2) {
                return prev;
            }
            prev.push({
                path: path.join(this.#options.dest, entry.name),
                index: parseInt(match[1]),
            });
            return prev;
        }, [])
            .sort(({ index: a }, { index: b }) => {
            return a < b ? -1 : a > b ? 1 : 0;
        });
    }
    /**
     * Re-indexes the existing log files associated with this file target, removing old log files whose index exceeds the {@link FileTargetOptions.maxFileCount}, and renaming the
     * remaining log files, leaving index "0" free for a new log file.
     */
    reIndex() {
        // When the destination directory is new, create it, and return.
        if (!fs.existsSync(this.#options.dest)) {
            fs.mkdirSync(this.#options.dest);
            return;
        }
        const logFiles = this.getLogFiles();
        for (let i = logFiles.length - 1; i >= 0; i--) {
            const log = logFiles[i];
            if (i >= this.#options.maxFileCount - 1) {
                fs.rmSync(log.path);
            }
            else {
                fs.renameSync(log.path, this.getLogFilePath(i + 1));
            }
        }
    }
}

let __isDebugMode = undefined;
/**
 * Determines whether the current plugin is running in a debug environment; this is determined by the command-line arguments supplied to the plugin by Stream. Specifically, the result
 * is `true` when  either `--inspect`, `--inspect-brk` or `--inspect-port` are present as part of the processes' arguments.
 * @returns `true` when the plugin is running in debug mode; otherwise `false`.
 */
function isDebugMode() {
    if (__isDebugMode === undefined) {
        __isDebugMode = process.execArgv.some((arg) => {
            const name = arg.split("=")[0];
            return name === "--inspect" || name === "--inspect-brk" || name === "--inspect-port";
        });
    }
    return __isDebugMode;
}
/**
 * Gets the plugin's unique-identifier from the current working directory.
 * @returns The plugin's unique-identifier.
 */
function getPluginUUID() {
    const name = path.basename(process.cwd());
    const suffixIndex = name.lastIndexOf(".sdPlugin");
    return suffixIndex < 0 ? name : name.substring(0, suffixIndex);
}

// Log all entires to a log file.
const fileTarget = new FileTarget({
    dest: path.join(node_process.cwd(), "logs"),
    fileName: getPluginUUID(),
    format: stringFormatter(),
    maxFileCount: 10,
    maxSize: 50 * 1024 * 1024,
});
// Construct the log targets.
const targets = [fileTarget];
if (isDebugMode()) {
    targets.splice(0, 0, new ConsoleTarget());
}
/**
 * Logger responsible for capturing log messages.
 */
const logger = new Logger({
    level: isDebugMode() ? "debug" : "info",
    minimumLevel: isDebugMode() ? "trace" : "debug",
    targets,
});
process.once("uncaughtException", (err) => logger.error("Process encountered uncaught exception", err));

/**
 * Provides a connection between the plugin and the Stream Deck allowing for messages to be sent and received.
 */
class Connection extends EventEmitter {
    /**
     * Private backing field for {@link Connection.registrationParameters}.
     */
    _registrationParameters;
    /**
     * Private backing field for {@link Connection.version}.
     */
    _version;
    /**
     * Used to ensure {@link Connection.connect} is invoked as a singleton; `false` when a connection is occurring or established.
     */
    canConnect = true;
    /**
     * Underlying web socket connection.
     */
    connection = withResolvers();
    /**
     * Logger scoped to the connection.
     */
    logger = logger.createScope("Connection");
    /**
     * Underlying connection information provided to the plugin to establish a connection with Stream Deck.
     * @returns The registration parameters.
     */
    get registrationParameters() {
        return (this._registrationParameters ??= this.getRegistrationParameters());
    }
    /**
     * Version of Stream Deck this instance is connected to.
     * @returns The version.
     */
    get version() {
        return (this._version ??= new Version(this.registrationParameters.info.application.version));
    }
    /**
     * Establishes a connection with the Stream Deck, allowing for the plugin to send and receive messages.
     * @returns A promise that is resolved when a connection has been established.
     */
    async connect() {
        // Ensure we only establish a single connection.
        if (this.canConnect) {
            this.canConnect = false;
            const webSocket = new WebSocket(`ws://127.0.0.1:${this.registrationParameters.port}`);
            webSocket.onmessage = (ev) => this.tryEmit(ev);
            webSocket.onopen = () => {
                webSocket.send(JSON.stringify({
                    event: this.registrationParameters.registerEvent,
                    uuid: this.registrationParameters.pluginUUID,
                }));
                // Web socket established a connection with the Stream Deck and the plugin was registered.
                this.connection.resolve(webSocket);
                this.emit("connected", this.registrationParameters.info);
            };
        }
        await this.connection.promise;
    }
    /**
     * Sends the commands to the Stream Deck, once the connection has been established and registered.
     * @param command Command being sent.
     * @returns `Promise` resolved when the command is sent to Stream Deck.
     */
    async send(command) {
        const connection = await this.connection.promise;
        const message = JSON.stringify(command);
        this.logger.trace(message);
        connection.send(message);
    }
    /**
     * Gets the registration parameters, provided by Stream Deck, that provide information to the plugin, including how to establish a connection.
     * @returns Parsed registration parameters.
     */
    getRegistrationParameters() {
        const params = {
            port: undefined,
            info: undefined,
            pluginUUID: undefined,
            registerEvent: undefined,
        };
        const scopedLogger = logger.createScope("RegistrationParameters");
        for (let i = 0; i < process.argv.length - 1; i++) {
            const param = process.argv[i];
            const value = process.argv[++i];
            switch (param) {
                case RegistrationParameter.Port:
                    scopedLogger.debug(`port=${value}`);
                    params.port = value;
                    break;
                case RegistrationParameter.PluginUUID:
                    scopedLogger.debug(`pluginUUID=${value}`);
                    params.pluginUUID = value;
                    break;
                case RegistrationParameter.RegisterEvent:
                    scopedLogger.debug(`registerEvent=${value}`);
                    params.registerEvent = value;
                    break;
                case RegistrationParameter.Info:
                    scopedLogger.debug(`info=${value}`);
                    params.info = JSON.parse(value);
                    break;
                default:
                    i--;
                    break;
            }
        }
        const invalidArgs = [];
        const validate = (name, value) => {
            if (value === undefined) {
                invalidArgs.push(name);
            }
        };
        validate(RegistrationParameter.Port, params.port);
        validate(RegistrationParameter.PluginUUID, params.pluginUUID);
        validate(RegistrationParameter.RegisterEvent, params.registerEvent);
        validate(RegistrationParameter.Info, params.info);
        if (invalidArgs.length > 0) {
            throw new Error(`Unable to establish a connection with Stream Deck, missing command line arguments: ${invalidArgs.join(", ")}`);
        }
        return params;
    }
    /**
     * Attempts to emit the {@link ev} that was received from the {@link Connection.connection}.
     * @param ev Event message data received from Stream Deck.
     */
    tryEmit(ev) {
        try {
            const message = JSON.parse(ev.data.toString());
            if (message.event) {
                this.logger.trace(ev.data.toString());
                this.emit(message.event, message);
            }
            else {
                this.logger.warn(`Received unknown message: ${ev.data}`);
            }
        }
        catch (err) {
            this.logger.error(`Failed to parse message: ${ev.data}`, err);
        }
    }
}
const connection = new Connection();

/**
 * Provides information for events received from Stream Deck.
 */
class Event {
    /**
     * Event that occurred.
     */
    type;
    /**
     * Initializes a new instance of the {@link Event} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        this.type = source.event;
    }
}

/**
 * Provides information for an event relating to an action.
 */
class ActionWithoutPayloadEvent extends Event {
    action;
    /**
     * Initializes a new instance of the {@link ActionWithoutPayloadEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
    }
}
/**
 * Provides information for an event relating to an action.
 */
class ActionEvent extends ActionWithoutPayloadEvent {
    /**
     * Provides additional information about the event that occurred, e.g. how many `ticks` the dial was rotated, the current `state` of the action, etc.
     */
    payload;
    /**
     * Initializes a new instance of the {@link ActionEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(action, source);
        this.payload = source.payload;
    }
}

const manifest$1 = new Lazy(() => {
    const path$1 = path.join(process.cwd(), "manifest.json");
    if (!fs.existsSync(path$1)) {
        throw new Error("Failed to read manifest.json as the file does not exist.");
    }
    try {
        return JSON.parse(fs.readFileSync(path$1, {
            encoding: "utf-8",
            flag: "r",
        }).toString());
    }
    catch (e) {
        if (e instanceof SyntaxError) {
            return null;
        }
        else {
            throw e;
        }
    }
});
const softwareMinimumVersion = new Lazy(() => {
    if (manifest$1.value === null) {
        return null;
    }
    return new Version(manifest$1.value.Software.MinimumVersion);
});
/**
 * Gets the SDK version that the plugin requires.
 * @returns SDK version; otherwise `null` when the plugin is DRM protected.
 */
function getSDKVersion() {
    return manifest$1.value?.SDKVersion ?? null;
}
/**
 * Gets the minimum version that the plugin requires.
 * @returns Minimum required version; otherwise `null` when the plugin is DRM protected.
 */
function getSoftwareMinimumVersion() {
    return softwareMinimumVersion.value;
}
/**
 * Gets the manifest associated with the plugin.
 * @returns The manifest; otherwise `null` when the plugin is DRM protected.
 */
function getManifest() {
    return manifest$1.value;
}

/**
 * Configuration shared by action components that must not depend on the plugin settings module.
 */
const actionConfig = {
    /**
     * Determines whether settings requests should use message identifiers and action settings cache behavior.
     */
    useExperimentalMessageIdentifiers: false,
};

const __items$1 = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyActionStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyActionStore}.
     */
    constructor() {
        super(__items$1);
    }
    /**
     * Gets the action with the specified identifier.
     * @param id Identifier of action to search for.
     * @returns The action, when present; otherwise `undefined`.
     */
    getActionById(id) {
        return __items$1.get(id);
    }
}
/**
 * Provides a store of Stream Deck actions.
 */
class ActionStore extends ReadOnlyActionStore {
    /**
     * Deletes the action from the store.
     * @param id The action's identifier.
     */
    delete(id) {
        __items$1.delete(id);
    }
    /**
     * Adds the action to the store.
     * @param action The action.
     */
    set(action) {
        __items$1.set(action.id, action);
    }
}
/**
 * Singleton instance of the action store.
 */
const actionStore = new ActionStore();

/**
 * Provides information for events relating to an application.
 */
class ApplicationEvent extends Event {
    /**
     * Monitored application that was launched/terminated.
     */
    application;
    /**
     * Initializes a new instance of the {@link ApplicationEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.application = source.payload.application;
    }
}

/**
 * Provides information for events relating to a device.
 */
class DeviceEvent extends Event {
    device;
    /**
     * Initializes a new instance of the {@link DeviceEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     * @param device Device that event is associated with.
     */
    constructor(source, device) {
        super(source);
        this.device = device;
    }
}

/**
 * Event information received from Stream Deck as part of a deep-link message being routed to the plugin.
 */
class DidReceiveDeepLinkEvent extends Event {
    /**
     * Deep-link URL routed from Stream Deck.
     */
    url;
    /**
     * Initializes a new instance of the {@link DidReceiveDeepLinkEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.url = new DeepLinkURL(source.payload.url);
    }
}
const PREFIX = "streamdeck://";
/**
 * Provides information associated with a URL received as part of a deep-link message, conforming to the URI syntax defined within RFC-3986 (https://datatracker.ietf.org/doc/html/rfc3986#section-3).
 */
class DeepLinkURL {
    /**
     * Fragment of the URL, with the number sign (#) omitted. For example, a URL of "/test#heading" would result in a {@link DeepLinkURL.fragment} of "heading".
     */
    fragment;
    /**
     * Original URL. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.href} of "/test?one=two#heading".
     */
    href;
    /**
     * Path of the URL; the full URL with the query and fragment omitted. For example, a URL of "/test?one=two#heading" would result in a {@link DeepLinkURL.path} of "/test".
     */
    path;
    /**
     * Query of the URL, with the question mark (?) omitted. For example, a URL of "/test?name=elgato&key=123" would result in a {@link DeepLinkURL.query} of "name=elgato&key=123".
     * See also {@link DeepLinkURL.queryParameters}.
     */
    query;
    /**
     * Query string parameters parsed from the URL. See also {@link DeepLinkURL.query}.
     */
    queryParameters;
    /**
     * Initializes a new instance of the {@link DeepLinkURL} class.
     * @param url URL of the deep-link, with the schema and authority omitted.
     */
    constructor(url) {
        const refUrl = new URL(`${PREFIX}${url}`);
        this.fragment = refUrl.hash.substring(1);
        this.href = refUrl.href.substring(PREFIX.length);
        this.path = DeepLinkURL.parsePath(this.href);
        this.query = refUrl.search.substring(1);
        this.queryParameters = refUrl.searchParams;
    }
    /**
     * Parses the {@link DeepLinkURL.path} from the specified {@link href}.
     * @param href Partial URL that contains the path to parse.
     * @returns The path of the URL.
     */
    static parsePath(href) {
        const indexOf = (char) => {
            const index = href.indexOf(char);
            return index >= 0 ? index : href.length;
        };
        return href.substring(0, Math.min(indexOf("?"), indexOf("#")));
    }
}

/**
 * Provides event information for when the plugin received the global settings.
 */
class DidReceiveGlobalSettingsEvent extends Event {
    /**
     * Settings associated with the event.
     */
    settings;
    /**
     * Initializes a new instance of the {@link DidReceiveGlobalSettingsEvent} class.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(source) {
        super(source);
        this.settings = source.payload.settings;
    }
}

/**
 * Provides information for an event triggered by a message being sent to the plugin, from the property inspector.
 */
class SendToPluginEvent extends Event {
    action;
    /**
     * Payload sent from the property inspector.
     */
    payload;
    /**
     * Initializes a new instance of the {@link SendToPluginEvent} class.
     * @param action Action that raised the event.
     * @param source Source of the event, i.e. the original message from Stream Deck.
     */
    constructor(action, source) {
        super(source);
        this.action = action;
        this.payload = source.payload;
    }
}

/**
 * Validates the `SDKVersion` within the manifest fulfils the minimum required version for the specified
 * feature; when the version is not fulfilled, an error is thrown with the feature formatted into the message.
 * @param minimumVersion Minimum required SDKVersion.
 * @param feature Feature that requires the version.
 */
function requiresSDKVersion(minimumVersion, feature) {
    const sdkVersion = getSDKVersion();
    if (sdkVersion !== null && minimumVersion > sdkVersion) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires manifest SDK version ${minimumVersion} or higher, but found version ${sdkVersion}; please update the "SDKVersion" in the plugin's manifest to ${minimumVersion} or higher.`);
    }
}
/**
 * Validates the {@link streamDeckVersion} and manifest's `Software.MinimumVersion` are at least the {@link minimumVersion};
 * when the version is not fulfilled, an error is thrown with the {@link feature} formatted into the message.
 * @param minimumVersion Minimum required version.
 * @param streamDeckVersion Actual application version.
 * @param feature Feature that requires the version.
 */
function requiresVersion(minimumVersion, streamDeckVersion, feature) {
    const required = {
        major: Math.floor(minimumVersion),
        minor: Number(minimumVersion.toString().split(".").at(1) ?? 0), // Account for JavaScript's floating point precision.
        patch: 0,
        build: 0,
    };
    if (streamDeckVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher, but current version is ${streamDeckVersion.major}.${streamDeckVersion.minor}; please update Stream Deck and the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
    const softwareMinimumVersion = getSoftwareMinimumVersion();
    if (softwareMinimumVersion !== null && softwareMinimumVersion.compareTo(required) === -1) {
        throw new Error(`[ERR_NOT_SUPPORTED]: ${feature} requires Stream Deck version ${required.major}.${required.minor} or higher; please update the "Software.MinimumVersion" in the plugin's manifest to "${required.major}.${required.minor}" or higher.`);
    }
}

const settings = {
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     * @returns The value.
     */
    get useExperimentalMessageIdentifiers() {
        return actionConfig.useExperimentalMessageIdentifiers;
    },
    /**
     * Available from Stream Deck 7.1; determines whether message identifiers should be sent when getting
     * action-instance or global settings.
     *
     * When `true`, the did-receive events associated with settings are only emitted when the action-instance
     * or global settings are changed in the property inspector.
     */
    set useExperimentalMessageIdentifiers(value) {
        requiresVersion(7.1, connection.version, "Message identifiers");
        actionConfig.useExperimentalMessageIdentifiers = value;
    },
    /**
     * Gets the global settings associated with the plugin.
     * @template T The type of global settings associated with the plugin.
     * @returns Promise containing the plugin's global settings.
     */
    getGlobalSettings: () => {
        return new Promise((resolve) => {
            connection.once("didReceiveGlobalSettings", (ev) => resolve(ev.payload.settings));
            connection.send({
                event: "getGlobalSettings",
                context: connection.registrationParameters.pluginUUID,
                id: node_crypto.randomUUID(),
            });
        });
    },
    /**
     * Occurs when the global settings are requested, or when the the global settings were updated in
     * the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveGlobalSettings: (listener) => {
        return connection.disposableOn("didReceiveGlobalSettings", (ev) => {
            // Do nothing when the global settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            listener(new DidReceiveGlobalSettingsEvent(ev));
        });
    },
    /**
     * Occurs when the settings associated with an action instance are requested, or when the the settings
     * were updated in the property inspector.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that removes the listener.
     */
    onDidReceiveSettings: (listener) => {
        return connection.disposableOn("didReceiveSettings", (ev) => {
            // Do nothing when the action's settings were requested.
            if (settings.useExperimentalMessageIdentifiers && ev.id) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    },
    /**
     * Sets the global settings associated the plugin; these settings are only available to this plugin,
     * and should be used to persist information securely.
     * @param settings Settings to save.
     * @example
     * streamDeck.settings.setGlobalSettings({
     *   apiKey,
     *   connectedDate: new Date()
     * })
     */
    setGlobalSettings: async (settings) => {
        await connection.send({
            event: "setGlobalSettings",
            context: connection.registrationParameters.pluginUUID,
            payload: settings,
        });
    },
};

/**
 * Controller capable of sending/receiving payloads with the property inspector, and listening for events.
 */
class UIController {
    /**
     * Action associated with the current property inspector.
     */
    #action;
    /**
     * To overcome event races, the debounce counter keeps track of appear vs disappear events, ensuring
     * we only clear the current ui when an equal number of matching disappear events occur.
     */
    #appearanceStackCount = 0;
    /**
     * Initializes a new instance of the {@link UIController} class.
     */
    constructor() {
        // Track the action for the current property inspector.
        this.onDidAppear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount++;
            }
            else {
                this.#appearanceStackCount = 1;
                this.#action = ev.action;
            }
        });
        this.onDidDisappear((ev) => {
            if (this.#isCurrent(ev.action)) {
                this.#appearanceStackCount--;
                if (this.#appearanceStackCount <= 0) {
                    this.#action = undefined;
                }
            }
        });
    }
    /**
     * Gets the action associated with the current property.
     * @returns The action; otherwise `undefined` when a property inspector is not visible.
     */
    get action() {
        return this.#action;
    }
    /**
     * Occurs when the property inspector associated with the action becomes visible, i.e. the user
     * selected an action in the Stream Deck application..
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidAppear(listener) {
        return connection.disposableOn("propertyInspectorDidAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the property inspector associated with the action disappears, i.e. the user unselected
     * the action in the Stream Deck application.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidDisappear(listener) {
        return connection.disposableOn("propertyInspectorDidDisappear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionWithoutPayloadEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when a message was sent to the plugin _from_ the property inspector.
     * @template TPayload The type of the payload received from the property inspector.
     * @template TSettings The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onSendToPlugin(listener) {
        return connection.disposableOn("sendToPlugin", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new SendToPluginEvent(action, ev));
            }
        });
    }
    /**
     * Sends the payload to the property inspector; the payload is only sent when the property inspector
     * is visible for an action provided by this plugin.
     * @param payload Payload to send.
     */
    async sendToPropertyInspector(payload) {
        if (this.#action) {
            await connection.send({
                event: "sendToPropertyInspector",
                context: this.#action.id,
                payload,
            });
        }
    }
    /**
     * Determines whether the specified action is the action for the current property inspector.
     * @param action Action to check against.
     * @returns `true` when the actions are the same.
     */
    #isCurrent(action) {
        return (this.#action?.id === action.id &&
            this.#action?.manifestId === action.manifestId &&
            this.#action?.device?.id === action.device.id);
    }
}
const ui = new UIController();

/**
 * Provides a cache for action settings, keyed by action instance identifier.
 */
class SettingsCache {
    /**
     * Underlying map of action ID to cached settings.
     */
    #entries = new Map();
    /**
     * Removes the cached settings for the specified action.
     * @param id Action instance identifier.
     */
    delete(id) {
        this.#entries.delete(id);
    }
    /**
     * Gets the cached settings for the specified action.
     * @param id Action instance identifier.
     * @returns The cached settings when present; otherwise `undefined`.
     */
    get(id) {
        const settings = this.#entries.get(id);
        return settings !== undefined ? structuredClone(settings) : undefined;
    }
    /**
     * Sets the cached settings for the specified action.
     * @param id Action instance identifier.
     * @param settings The settings to cache.
     */
    set(id, settings) {
        this.#entries.set(id, structuredClone(settings));
    }
}
/**
 * Singleton instance of the settings cache.
 */
const settingsCache = new SettingsCache();

const __items = new Map();
/**
 * Provides a read-only store of Stream Deck devices.
 */
class ReadOnlyDeviceStore extends Enumerable {
    /**
     * Initializes a new instance of the {@link ReadOnlyDeviceStore}.
     */
    constructor() {
        super(__items);
    }
    /**
     * Gets the Stream Deck {@link Device} associated with the specified {@link deviceId}.
     * @param deviceId Identifier of the Stream Deck device.
     * @returns The Stream Deck device information; otherwise `undefined` if a device with the {@link deviceId} does not exist.
     */
    getDeviceById(deviceId) {
        return __items.get(deviceId);
    }
}
/**
 * Provides a store of Stream Deck devices.
 */
class DeviceStore extends ReadOnlyDeviceStore {
    /**
     * Adds the device to the store.
     * @param device The device.
     */
    set(device) {
        __items.set(device.id, device);
    }
}
/**
 * Singleton instance of the device store.
 */
const deviceStore = new DeviceStore();

/**
 * Provides information about an instance of a Stream Deck action.
 */
class ActionContext {
    /**
     * Device the action is associated with.
     */
    #device;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@link ActionContext} class.
     * @param source Source of the action.
     */
    constructor(source) {
        this.#source = source;
        const device = deviceStore.getDeviceById(source.device);
        if (!device) {
            throw new Error(`Failed to initialize action; device ${source.device} not found`);
        }
        this.#device = device;
    }
    /**
     * Type of the action.
     * - `Keypad` is a key.
     * - `Encoder` is a dial and portion of the touch strip.
     * @returns Controller type.
     */
    get controllerType() {
        return this.#source.payload.controller;
    }
    /**
     * Stream Deck device the action is positioned on.
     * @returns Stream Deck device.
     */
    get device() {
        return this.#device;
    }
    /**
     * Action instance identifier.
     * @returns Identifier.
     */
    get id() {
        return this.#source.context;
    }
    /**
     * Manifest identifier (UUID) for this action type.
     * @returns Manifest identifier.
     */
    get manifestId() {
        return this.#source.action;
    }
    /**
     * Converts this instance to a serializable object.
     * @returns The serializable object.
     */
    toJSON() {
        return {
            controllerType: this.controllerType,
            device: this.device,
            id: this.id,
            manifestId: this.manifestId,
        };
    }
}

const REQUEST_TIMEOUT = 15 * 1000; // 15s
/**
 * Provides a contextualized instance of an {@link Action}, allowing for direct communication with the Stream Deck.
 * @template T The type of settings associated with the action.
 */
class Action extends ActionContext {
    /**
     * Gets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @returns The resources.
     */
    async getResources() {
        requiresVersion(7.1, connection.version, "getResources");
        const res = await this.#fetch("getResources", "didReceiveResources");
        return res.payload.resources;
    }
    /**
     * Gets the settings associated this action instance.
     * @template U The type of settings associated with the action.D
     * @returns Promise containing the action instance's settings.
     */
    async getSettings() {
        if (actionConfig.useExperimentalMessageIdentifiers) {
            const cached = settingsCache.get(this.id);
            if (cached !== undefined) {
                logger.trace(JSON.stringify({
                    event: "getSettings",
                    context: this.id,
                    source: "cache",
                    settings: cached,
                }));
                return cached;
            }
        }
        const res = await this.#fetch("getSettings", "didReceiveSettings");
        return res.payload.settings;
    }
    /**
     * Determines whether this instance is a dial.
     * @returns `true` when this instance is a dial; otherwise `false`.
     */
    isDial() {
        return this.controllerType === "Encoder";
    }
    /**
     * Determines whether this instance is a key.
     * @returns `true` when this instance is a key; otherwise `false`.
     */
    isKey() {
        return this.controllerType === "Keypad";
    }
    /**
     * Sets the resources (files) associated with this action; these resources are embedded into the
     * action when it is exported, either individually, or as part of a profile.
     *
     * Available from Stream Deck 7.1.
     * @example
     * action.setResources({
     *   fileOne: "c:\\hello-world.txt",
     *   anotherFile: "c:\\icon.png"
     * });
     * @param resources The resources as a map of file paths.
     * @returns `Promise` resolved when the resources are saved to Stream Deck.
     */
    setResources(resources) {
        requiresVersion(7.1, connection.version, "setResources");
        return connection.send({
            event: "setResources",
            context: this.id,
            payload: resources,
        });
    }
    /**
     * Sets the settings associated with this action instance. Use in conjunction with {@link Action.getSettings}.
     * @param value Settings to persist.
     * @returns `Promise` resolved when the settings are sent to Stream Deck.
     */
    setSettings(value) {
        settingsCache.delete(this.id);
        return connection.send({
            event: "setSettings",
            context: this.id,
            payload: value,
        });
    }
    /**
     * Temporarily shows an alert (i.e. warning), in the form of an exclamation mark in a yellow triangle, on this action instance. Used to provide visual feedback when an action failed.
     * @returns `Promise` resolved when the request to show an alert has been sent to Stream Deck.
     */
    showAlert() {
        return connection.send({
            event: "showAlert",
            context: this.id,
        });
    }
    /**
     * Fetches information from Stream Deck by sending the command, and awaiting the event.
     * @param command Name of the event (command) to send.
     * @param event Name of the event to await.
     * @returns The payload from the received event.
     */
    async #fetch(command, event) {
        const { resolve, reject, promise } = withResolvers();
        // Set a timeout to prevent endless awaiting.
        const timeoutId = setTimeout(() => {
            listener.dispose();
            reject("The request timed out");
        }, REQUEST_TIMEOUT);
        // Listen for an event that can resolve the request.
        const listener = connection.disposableOn(event, (ev) => {
            // Make sure the received event is for this action.
            if (ev.context == this.id) {
                clearTimeout(timeoutId);
                listener.dispose();
                resolve(ev);
            }
        });
        // Send the request; specifying an id signifies its a request.
        await connection.send({
            event: command,
            context: this.id,
            id: node_crypto.randomUUID(),
        });
        return promise;
    }
}

/**
 * Provides a contextualized instance of a dial action.
 * @template T The type of settings associated with the action.
 */
class DialAction extends Action {
    /**
     * Private backing field for {@link DialAction.coordinates}.
     */
    #coordinates;
    /**
     * Initializes a new instance of the {@see DialAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Encoder") {
            throw new Error("Unable to create DialAction; source event is not a Encoder");
        }
        this.#coordinates = Object.freeze(source.payload.coordinates);
    }
    /**
     * Coordinates of the dial.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Sets the feedback for the current layout associated with this action instance, allowing for the visual items to be updated. Layouts are a powerful way to provide dynamic information
     * to users, and can be assigned in the manifest, or dynamically via {@link Action.setFeedbackLayout}.
     *
     * The {@link feedback} payload defines which items within the layout will be updated, and are identified by their property name (defined as the `key` in the layout's definition).
     * The values can either by a complete new definition, a `string` for layout item types of `text` and `pixmap`, or a `number` for layout item types of `bar` and `gbar`.
     * @param feedback Object containing information about the layout items to be updated.
     * @returns `Promise` resolved when the request to set the {@link feedback} has been sent to Stream Deck.
     */
    setFeedback(feedback) {
        return connection.send({
            event: "setFeedback",
            context: this.id,
            payload: feedback,
        });
    }
    /**
     * Sets the layout associated with this action instance. The layout must be either a built-in layout identifier, or path to a local layout JSON file within the plugin's folder.
     * Use in conjunction with {@link Action.setFeedback} to update the layout's current items' settings.
     * @param layout Name of a pre-defined layout, or relative path to a custom one.
     * @returns `Promise` resolved when the new layout has been sent to Stream Deck.
     */
    setFeedbackLayout(layout) {
        return connection.send({
            event: "setFeedbackLayout",
            context: this.id,
            payload: {
                layout,
            },
        });
    }
    /**
     * Sets the {@link image} to be display for this action instance within Stream Deck app.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title) {
        return this.setFeedback({ title });
    }
    /**
     * Sets the trigger (interaction) {@link descriptions} associated with this action instance. Descriptions are shown within the Stream Deck application, and informs the user what
     * will happen when they interact with the action, e.g. rotate, touch, etc. When {@link descriptions} is `undefined`, the descriptions will be reset to the values provided as part
     * of the manifest.
     *
     * NB: Applies to encoders (dials / touchscreens) found on Stream Deck + devices.
     * @param descriptions Descriptions that detail the action's interaction.
     * @returns `Promise` resolved when the request to set the {@link descriptions} has been sent to Stream Deck.
     */
    setTriggerDescription(descriptions) {
        return connection.send({
            event: "setTriggerDescription",
            context: this.id,
            payload: descriptions || {},
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
        };
    }
}

/**
 * Provides a contextualized instance of a key action.
 * @template T The type of settings associated with the action.
 */
class KeyAction extends Action {
    /**
     * Private backing field for {@link KeyAction.coordinates}.
     */
    #coordinates;
    /**
     * Source of the action.
     */
    #source;
    /**
     * Initializes a new instance of the {@see KeyAction} class.
     * @param source Source of the action.
     */
    constructor(source) {
        super(source);
        if (source.payload.controller !== "Keypad") {
            throw new Error("Unable to create KeyAction; source event is not a Keypad");
        }
        this.#coordinates = !source.payload.isInMultiAction ? Object.freeze(source.payload.coordinates) : undefined;
        this.#source = source;
    }
    /**
     * Coordinates of the key; otherwise `undefined` when the action is part of a multi-action.
     * @returns The coordinates.
     */
    get coordinates() {
        return this.#coordinates;
    }
    /**
     * Determines whether the key is part of a multi-action.
     * @returns `true` when in a multi-action; otherwise `false`.
     */
    isInMultiAction() {
        return this.#source.payload.isInMultiAction;
    }
    /**
     * Sets the {@link image} to be display for this action instance.
     *
     * NB: The image can only be set by the plugin when the the user has not specified a custom image.
     * @param image Image to display; this can be either a path to a local file within the plugin's folder, a base64 encoded `string` with the mime type declared (e.g. PNG, JPEG, etc.),
     * or an SVG `string`. When `undefined`, the image from the manifest will be used.
     * @param options Additional options that define where and how the image should be rendered.
     * @returns `Promise` resolved when the request to set the {@link image} has been sent to Stream Deck.
     */
    setImage(image, options) {
        return connection.send({
            event: "setImage",
            context: this.id,
            payload: {
                image,
                ...options,
            },
        });
    }
    /**
     * Sets the current {@link state} of this action instance; only applies to actions that have multiple states defined within the manifest.
     * @param state State to set; this be either 0, or 1.
     * @returns `Promise` resolved when the request to set the state of an action instance has been sent to Stream Deck.
     */
    setState(state) {
        return connection.send({
            event: "setState",
            context: this.id,
            payload: {
                state,
            },
        });
    }
    /**
     * Sets the {@link title} displayed for this action instance.
     *
     * NB: The title can only be set by the plugin when the the user has not specified a custom title.
     * @param title Title to display; when `undefined` the title within the manifest will be used.
     * @param options Additional options that define where and how the title should be rendered.
     * @returns `Promise` resolved when the request to set the {@link title} has been sent to Stream Deck.
     */
    setTitle(title, options) {
        return connection.send({
            event: "setTitle",
            context: this.id,
            payload: {
                title,
                ...options,
            },
        });
    }
    /**
     * Temporarily shows an "OK" (i.e. success), in the form of a check-mark in a green circle, on this action instance. Used to provide visual feedback when an action successfully
     * executed.
     * @returns `Promise` resolved when the request to show an "OK" has been sent to Stream Deck.
     */
    showOk() {
        return connection.send({
            event: "showOk",
            context: this.id,
        });
    }
    /**
     * @inheritdoc
     */
    toJSON() {
        return {
            ...super.toJSON(),
            coordinates: this.coordinates,
            isInMultiAction: this.isInMultiAction(),
        };
    }
}

const manifest = new Lazy(() => getManifest());
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class ActionService extends ReadOnlyActionStore {
    /**
     * Initializes a new instance of the {@link ActionService} class.
     */
    constructor() {
        super();
        // Adds the action to the store.
        connection.prependListener("willAppear", (ev) => {
            const action = ev.payload.controller === "Encoder" ? new DialAction(ev) : new KeyAction(ev);
            actionStore.set(action);
            if (actionConfig.useExperimentalMessageIdentifiers) {
                settingsCache.set(ev.context, ev.payload.settings);
            }
        });
        // Update the settings cache when settings are received.
        connection.prependListener("didReceiveSettings", (ev) => {
            if (actionConfig.useExperimentalMessageIdentifiers) {
                settingsCache.set(ev.context, ev.payload.settings);
            }
        });
        // Remove the action from the store.
        connection.prependListener("willDisappear", (ev) => {
            actionStore.delete(ev.context);
            settingsCache.delete(ev.context);
        });
    }
    /**
     * Occurs when the user presses a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialDown(listener) {
        return connection.disposableOn("dialDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user rotates a dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialRotate(listener) {
        return connection.disposableOn("dialRotate", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed dial (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDialUp(listener) {
        return connection.disposableOn("dialUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the resources were updated within the property inspector.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDidReceiveResources(listener) {
        return connection.disposableOn("didReceiveResources", (ev) => {
            // When the id is defined, the resources were requested, so we don't propagate the event.
            if (ev.id !== undefined) {
                return;
            }
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user presses a action down.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyDown(listener) {
        return connection.disposableOn("keyDown", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user releases a pressed action.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onKeyUp(listener) {
        return connection.disposableOn("keyUp", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isKey()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user updates an action's title settings in the Stream Deck application. See also {@link Action.setTitle}.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTitleParametersDidChange(listener) {
        return connection.disposableOn("titleParametersDidChange", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when the user taps the touchscreen (Stream Deck +).
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onTouchTap(listener) {
        return connection.disposableOn("touchTap", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action?.isDial()) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action appears on the Stream Deck due to the user navigating to another page, profile, folder, etc. This also occurs during startup if the action is on the "front
     * page". An action refers to _all_ types of actions, e.g. keys, dials,
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillAppear(listener) {
        return connection.disposableOn("willAppear", (ev) => {
            const action = actionStore.getActionById(ev.context);
            if (action) {
                listener(new ActionEvent(action, ev));
            }
        });
    }
    /**
     * Occurs when an action disappears from the Stream Deck due to the user navigating to another page, profile, folder, etc. An action refers to _all_ types of actions, e.g. keys,
     * dials, touchscreens, pedals, etc.
     * @template T The type of settings associated with the action.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onWillDisappear(listener) {
        return connection.disposableOn("willDisappear", (ev) => listener(new ActionEvent(new ActionContext(ev), ev)));
    }
    /**
     * Registers the action with the Stream Deck, routing all events associated with the {@link SingletonAction.manifestId} to the specified {@link action}.
     * @param action The action to register.
     * @example
     * ＠action({ UUID: "com.elgato.test.action" })
     * class MyCustomAction extends SingletonAction {
     *     export function onKeyDown(ev: KeyDownEvent) {
     *         // Do some awesome thing.
     *     }
     * }
     *
     * streamDeck.actions.registerAction(new MyCustomAction());
     */
    registerAction(action) {
        if (action.manifestId === undefined) {
            throw new Error("The action's manifestId cannot be undefined.");
        }
        if (manifest.value !== null && !manifest.value.Actions.some((a) => a.UUID === action.manifestId)) {
            throw new Error(`The action's manifestId was not found within the manifest: ${action.manifestId}`);
        }
        // Routes an event to the action, when the applicable listener is defined on the action.
        const { manifestId } = action;
        const route = (fn, listener) => {
            const boundedListener = listener?.bind(action);
            if (boundedListener === undefined) {
                return;
            }
            fn.bind(action)(async (ev) => {
                if (ev.action.manifestId == manifestId) {
                    await boundedListener(ev);
                }
            });
        };
        // Route each of the action events.
        route(this.onDialDown, action.onDialDown);
        route(this.onDialUp, action.onDialUp);
        route(this.onDialRotate, action.onDialRotate);
        route(ui.onSendToPlugin, action.onSendToPlugin);
        route(this.onDidReceiveResources, action.onDidReceiveResources);
        route(settings.onDidReceiveSettings, action.onDidReceiveSettings);
        route(this.onKeyDown, action.onKeyDown);
        route(this.onKeyUp, action.onKeyUp);
        route(ui.onDidAppear, action.onPropertyInspectorDidAppear);
        route(ui.onDidDisappear, action.onPropertyInspectorDidDisappear);
        route(this.onTitleParametersDidChange, action.onTitleParametersDidChange);
        route(this.onTouchTap, action.onTouchTap);
        route(this.onWillAppear, action.onWillAppear);
        route(this.onWillDisappear, action.onWillDisappear);
    }
}
/**
 * Service for interacting with Stream Deck actions.
 */
const actionService = new ActionService();

/**
 * Provides information about a device.
 */
class Device {
    /**
     * Private backing field for {@link Device.isConnected}.
     */
    #isConnected = false;
    /**
     * Private backing field for the device's information.
     */
    #info;
    /**
     * Unique identifier of the device.
     */
    id;
    /**
     * Initializes a new instance of the {@link Device} class.
     * @param id Device identifier.
     * @param info Information about the device.
     * @param isConnected Determines whether the device is connected.
     */
    constructor(id, info, isConnected) {
        this.id = id;
        this.#info = info;
        this.#isConnected = isConnected;
        // Set connected.
        connection.prependListener("deviceDidConnect", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
                this.#isConnected = true;
            }
        });
        // Track changes.
        connection.prependListener("deviceDidChange", (ev) => {
            if (ev.device === this.id) {
                this.#info = ev.deviceInfo;
            }
        });
        // Set disconnected.
        connection.prependListener("deviceDidDisconnect", (ev) => {
            if (ev.device === this.id) {
                this.#isConnected = false;
            }
        });
    }
    /**
     * Actions currently visible on the device.
     * @returns Collection of visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.device.id === this.id);
    }
    /**
     * Determines whether the device is currently connected.
     * @returns `true` when the device is connected; otherwise `false`.
     */
    get isConnected() {
        return this.#isConnected;
    }
    /**
     * Name of the device, as specified by the user in the Stream Deck application.
     * @returns Name of the device.
     */
    get name() {
        return this.#info.name;
    }
    /**
     * Number of action slots, excluding dials / touchscreens, available to the device.
     * @returns Size of the device.
     */
    get size() {
        return this.#info.size;
    }
    /**
     * Type of the device that was connected, e.g. Stream Deck +, Stream Deck Pedal, etc. See {@link DeviceType}.
     * @returns Type of the device.
     */
    get type() {
        return this.#info.type;
    }
}

/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
class DeviceService extends ReadOnlyDeviceStore {
    /**
     * Initializes a new instance of the {@link DeviceService}.
     */
    constructor() {
        super();
        // Add the devices from registration parameters.
        connection.once("connected", (info) => {
            info.devices.forEach((dev) => deviceStore.set(new Device(dev.id, dev, false)));
        });
        // Add new devices that were connected.
        connection.on("deviceDidConnect", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, true));
            }
        });
        // Add new devices that were changed (Virtual Stream Deck event race).
        connection.on("deviceDidChange", ({ device: id, deviceInfo }) => {
            if (!deviceStore.getDeviceById(id)) {
                deviceStore.set(new Device(id, deviceInfo, false));
            }
        });
    }
    /**
     * Occurs when a Stream Deck device changed, for example its name or size.
     *
     * Available from Stream Deck 7.0.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidChange(listener) {
        requiresVersion(7.0, connection.version, "onDeviceDidChange");
        return connection.disposableOn("deviceDidChange", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is connected. See also {@link DeviceService.onDeviceDidConnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidConnect(listener) {
        return connection.disposableOn("deviceDidConnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
    /**
     * Occurs when a Stream Deck device is disconnected. See also {@link DeviceService.onDeviceDidDisconnect}.
     * @param listener Function to be invoked when the event occurs.
     * @returns A disposable that, when disposed, removes the listener.
     */
    onDeviceDidDisconnect(listener) {
        return connection.disposableOn("deviceDidDisconnect", (ev) => listener(new DeviceEvent(ev, this.getDeviceById(ev.device))));
    }
}
/**
 * Provides functions, and information, for interacting with Stream Deck actions.
 */
const deviceService = new DeviceService();

/**
 * Loads a locale from the file system.
 * @param language Language to load.
 * @returns Contents of the locale.
 */
function fileSystemLocaleProvider(language) {
    const filePath = path.join(process.cwd(), `${language}.json`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    try {
        // Parse the translations from the file.
        const contents = fs.readFileSync(filePath, { flag: "r" })?.toString();
        return parseLocalizations(contents);
    }
    catch (err) {
        logger.error(`Failed to load translations from ${filePath}`, err);
        return null;
    }
}
/**
 * Parses the localizations from the specified contents, or throws a `TypeError` when unsuccessful.
 * @param contents Contents that represent the stringified JSON containing the localizations.
 * @returns The localizations; otherwise a `TypeError`.
 */
function parseLocalizations(contents) {
    const json = JSON.parse(contents);
    if (json !== undefined && json !== null && typeof json === "object" && "Localization" in json) {
        return json["Localization"];
    }
    throw new TypeError(`Translations must be a JSON object nested under a property named "Localization"`);
}

/**
 * Requests the Stream Deck switches the current profile of the specified {@link deviceId} to the {@link profile}; when no {@link profile} is provided the previously active profile
 * is activated.
 *
 * NB: Plugins may only switch to profiles distributed with the plugin, as defined within the manifest, and cannot access user-defined profiles.
 * @param deviceId Unique identifier of the device where the profile should be set.
 * @param profile Optional name of the profile to switch to; when `undefined` the previous profile will be activated. Name must be identical to the one provided in the manifest.
 * @param page Optional page to show when switching to the {@link profile}, indexed from 0. When `undefined`, the page that was previously visible (when switching away from the
 * profile) will be made visible.
 * @returns `Promise` resolved when the request to switch the `profile` has been sent to Stream Deck.
 */
function switchToProfile(deviceId, profile, page) {
    if (page !== undefined) {
        requiresVersion(6.5, connection.version, "Switching to a profile page");
    }
    return connection.send({
        event: "switchToProfile",
        context: connection.registrationParameters.pluginUUID,
        device: deviceId,
        payload: {
            page,
            profile,
        },
    });
}

var profiles = /*#__PURE__*/Object.freeze({
    __proto__: null,
    switchToProfile: switchToProfile
});

/**
 * Occurs when a monitored application is launched. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidTerminate}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidLaunch(listener) {
    return connection.disposableOn("applicationDidLaunch", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a monitored application terminates. Monitored applications can be defined in the manifest via the {@link Manifest.ApplicationsToMonitor} property.
 * See also {@link onApplicationDidLaunch}.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onApplicationDidTerminate(listener) {
    return connection.disposableOn("applicationDidTerminate", (ev) => listener(new ApplicationEvent(ev)));
}
/**
 * Occurs when a deep-link message is routed to the plugin from Stream Deck. One-way deep-link messages can be sent to plugins from external applications using the URL format
 * `streamdeck://plugins/message/<PLUGIN_UUID>/{MESSAGE}`.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onDidReceiveDeepLink(listener) {
    requiresVersion(6.5, connection.version, "Receiving deep-link messages");
    return connection.disposableOn("didReceiveDeepLink", (ev) => listener(new DidReceiveDeepLinkEvent(ev)));
}
/**
 * Occurs when the computer wakes up.
 * @param listener Function to be invoked when the event occurs.
 * @returns A disposable that, when disposed, removes the listener.
 */
function onSystemDidWakeUp(listener) {
    return connection.disposableOn("systemDidWakeUp", (ev) => listener(new Event(ev)));
}
/**
 * Opens the specified `url` in the user's default browser.
 * @param url URL to open.
 * @returns `Promise` resolved when the request to open the `url` has been sent to Stream Deck.
 */
function openUrl(url) {
    return connection.send({
        event: "openUrl",
        payload: {
            url,
        },
    });
}
/**
 * Gets the secrets associated with the plugin.
 * @returns `Promise` resolved with the secrets associated with the plugin.
 */
function getSecrets() {
    requiresVersion(6.9, connection.version, "Secrets");
    requiresSDKVersion(3, "Secrets");
    return new Promise((resolve) => {
        connection.once("didReceiveSecrets", (ev) => resolve(ev.payload.secrets));
        connection.send({
            event: "getSecrets",
            context: connection.registrationParameters.pluginUUID,
        });
    });
}

var system = /*#__PURE__*/Object.freeze({
    __proto__: null,
    getSecrets: getSecrets,
    onApplicationDidLaunch: onApplicationDidLaunch,
    onApplicationDidTerminate: onApplicationDidTerminate,
    onDidReceiveDeepLink: onDidReceiveDeepLink,
    onSystemDidWakeUp: onSystemDidWakeUp,
    openUrl: openUrl
});

/**
 * Defines a Stream Deck action associated with the plugin.
 * @param definition The definition of the action, e.g. it's identifier, name, etc.
 * @returns The definition decorator.
 */
function action(definition) {
    const manifestId = definition.UUID;
    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type, @typescript-eslint/no-unused-vars
    return function (target, context) {
        return class extends target {
            /**
             * The universally-unique value that identifies the action within the manifest.
             */
            manifestId = manifestId;
        };
    };
}

/**
 * Provides the main bridge between the plugin and the Stream Deck allowing the plugin to send requests and receive events, e.g. when the user presses an action.
 * @template T The type of settings associated with the action.
 */
class SingletonAction {
    /**
     * The universally-unique value that identifies the action within the manifest.
     */
    manifestId;
    /**
     * Gets the visible actions with the `manifestId` that match this instance's.
     * @returns The visible actions.
     */
    get actions() {
        return actionStore.filter((a) => a.manifestId === this.manifestId);
    }
}

let i18n;
const streamDeck = {
    /**
     * Namespace for event listeners and functionality relating to Stream Deck actions.
     * @returns Actions namespace.
     */
    get actions() {
        return actionService;
    },
    /**
     * Namespace for interacting with Stream Deck devices.
     * @returns Devices namespace.
     */
    get devices() {
        return deviceService;
    },
    /**
     * Internalization provider, responsible for managing localizations and translating resources.
     * @returns Internalization provider.
     */
    get i18n() {
        return (i18n ??= new I18nProvider(this.info.application.language, fileSystemLocaleProvider));
    },
    /**
     * Registration and application information provided by Stream Deck during initialization.
     * @returns Registration information.
     */
    get info() {
        return connection.registrationParameters.info;
    },
    /**
     * Logger responsible for capturing log messages.
     * @returns The logger.
     */
    get logger() {
        return logger;
    },
    /**
     * Namespace for Stream Deck profiles.
     * @returns Profiles namespace.
     */
    get profiles() {
        return profiles;
    },
    /**
     * Namespace for persisting settings within Stream Deck.
     * @returns Settings namespace.
     */
    get settings() {
        return settings;
    },
    /**
     * Namespace for interacting with, and receiving events from, the system the plugin is running on.
     * @returns System namespace.
     */
    get system() {
        return system;
    },
    /**
     * Namespace for interacting with UI (property inspector) associated with the plugin.
     * @returns UI namespace.
     */
    get ui() {
        return ui;
    },
    /**
     * Connects the plugin to the Stream Deck.
     * @returns A promise resolved when a connection has been established.
     */
    connect() {
        return connection.connect();
    },
};

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __esDecorate(ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
}
function __runInitializers(thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
}
typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

const noop = { info: () => { }, warn: () => { } };
let current = noop;
function setLogger(logger) {
    current = logger;
}
const log = {
    info: (message, ...args) => current.info(message, ...args),
    warn: (message, ...args) => current.warn(message, ...args),
};

const HID_UNAVAILABLE = "node-hid not available. Run `npm run sync-deps` on the machine running Stream Deck.";
/**
 * node-hid is a native addon that only gets installed into the .sdPlugin folder
 * on the target machine (see scripts/sync-runtime-deps.mjs). Loading it lazily
 * means a missing/mismatched binary only disables the HID-based providers
 * instead of taking down the whole plugin.
 */
let cached;
async function loadHid() {
    if (cached !== undefined)
        return cached;
    try {
        const ns = await import('node-hid');
        cached = ns.default ?? ns;
    }
    catch (err) {
        // Every HID provider goes quiet when this happens, which otherwise looks
        // exactly like a desk with no supported devices on it.
        log.warn(`${HID_UNAVAILABLE} (${String(err)})`);
        cached = null;
    }
    return cached;
}
/**
 * Opens a HID interface, runs `use`, and closes it again whatever happens.
 *
 * Every provider had its own copy of this open/try/finally dance, and the
 * handles are exclusive on Windows — one early return that skipped the close
 * would lock the device out until Stream Deck restarted. Returns `fallback` if
 * the interface can't be opened or the work throws, because a provider must
 * never take down a scan.
 */
async function withHidDevice(path, fallback, use, context) {
    const HID = await loadHid();
    if (!HID)
        return fallback;
    let device;
    try {
        device = new HID.HID(path);
        return await use(device);
    }
    catch (err) {
        if (context)
            log.warn(`${context}: ${String(err)}`);
        return fallback;
    }
    finally {
        try {
            device?.close();
        }
        catch {
            // Already gone — unplugged mid-read, most likely.
        }
    }
}
/** Enumerates connected HID interfaces, optionally filtered by vendor. */
async function hidDevices(vendorId) {
    const HID = await loadHid();
    if (!HID)
        return null;
    try {
        const all = HID.devices();
        return vendorId === undefined ? all : all.filter((d) => d.vendorId === vendorId);
    }
    catch {
        return [];
    }
}

/**
 * A whole-number percentage inside 0-100.
 *
 * Every provider scales a raw value into a percentage, and each was clamping it
 * differently — a couple only capped the top, so a decode that went negative
 * could paint a key below empty.
 */
function clampPercent(value) {
    if (!Number.isFinite(value))
        return 0;
    return Math.max(0, Math.min(100, Math.round(value)));
}
/** The device isn't answering right now. It may well be back next poll. */
function notFound(deviceLabel, detail) {
    return { deviceLabel, percent: null, status: "not-found", detail };
}
/** The device is there, but nothing here knows how to read a battery from it. */
function unsupported(deviceLabel, detail) {
    return { deviceLabel, percent: null, status: "unsupported", detail };
}
function slug(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
}
function hex4(value) {
    return value.toString(16).padStart(4, "0");
}

const VENDOR_ID$1 = 0x0b05; // ASUSTek
/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_KEYBOARD$2 = 0x06;
const USAGE_MOUSE$2 = 0x02;
const USAGE_GAMEPAD$2 = 0x05;
const USAGE_JOYSTICK$1 = 0x04;
/**
 * ROG receivers expose three vendor collections, each accepting exactly one
 * output report id. Windows rejects every other id with ERROR_INVALID_PARAMETER,
 * so the id has to match the collection.
 */
const REPORT_ID_BY_USAGE_PAGE = new Map([
    [0xff02, 0x01],
    [0xff00, 0x02],
    [0xff01, 0x03],
]);
/** Output reports are 64 bytes including the leading report id. */
const REPORT_LENGTH$1 = 64;
const REPLY_TIMEOUT_MS = 400;
/** 0x12 is the "read info" command family; sub-command 0x01 returns power data. */
const CMD_READ_INFO = 0x12;
const SUB_POWER = 0x01;
/**
 * Layout of the power frame, verified against Armoury Crate on a ROG Azoth:
 *
 *   02 12 01 00 00 00 56 04 00 00 14 56 47 10 ...
 *   |  |  |           |           |  |
 *   |  |  |           |           |  +-- [11] battery again (mirror)
 *   |  |  |           |           +----- [10] low-battery warning threshold (0x14 = 20%,
 *   |  |  |           |                        matching Armoury Crate's 20% setting)
 *   |  |  |           +----------------- [6]  battery percentage (0x56 = 86)
 *   |  |  +----------------------------- [2]  sub-command echo
 *   |  +-------------------------------- [1]  command echo
 *   +----------------------------------- [0]  report id echo
 *
 * The device answers unsupported commands with `<id> ff aa`.
 */
const PERCENT_INDEX = 6;
const PERCENT_MIRROR_INDEX = 11;
const THRESHOLD_INDEX = 10;
const ERROR_MARKER = [0xff, 0xaa];
/**
 * Asus ROG peripherals are detected by enumeration — names come from each
 * device's own USB product descriptor, so whatever ROG gear is plugged in shows
 * up without a model list.
 *
 * Battery is read over the receiver's vendor collection. There is no public spec
 * for this; the command and frame layout were derived on real hardware (see
 * README "Asus battery protocol" and scripts/asus-*), and validated against the
 * percentage and low-battery threshold Armoury Crate displays. A device that
 * doesn't answer is reported as not detected rather than guessed at — it is
 * usually just switched off behind a dongle that's still plugged in.
 */
class AsusProvider {
    id = "asus";
    async discover() {
        const devices = await hidDevices(VENDOR_ID$1);
        if (!devices)
            return [];
        // One physical device exposes several HID interfaces; collapse to one entry
        // per productId, preferring the interface that names a form factor.
        const byProduct = new Map();
        for (const info of devices) {
            const label = (info.product ?? "").trim() || `Asus device ${hex4(info.productId)}`;
            const kind = kindOf$3(info.usagePage, info.usage, label);
            const existing = byProduct.get(info.productId);
            if (existing && (existing.kind !== "other" || kind === "other"))
                continue;
            byProduct.set(info.productId, {
                key: `asus:${hex4(info.productId)}`,
                providerId: this.id,
                label,
                kind,
                supportsBattery: false,
                locator: { productId: info.productId },
            });
        }
        // Only surface things that actually present as a peripheral. ASUSTek's
        // vendor id also covers motherboard gear ("AURA LED Controller" and
        // friends) that has no battery and no business in a device picker.
        const candidates = [...byProduct.values()].filter((d) => d.kind !== "other");
        for (const device of candidates) {
            const reading = await this.readPower(Number(device.locator.productId), device.label);
            if (reading) {
                device.supportsBattery = true;
                device.reading = reading;
            }
            else {
                // Silent, not batteryless: a ROG keyboard that's switched off still
                // leaves its dongle plugged in and answers nothing. "not-found" is
                // what a device that may come back looks like — and it lets the key
                // back off its polling instead of probing something that's asleep.
                device.reading = notFound(device.label, "Detected, but it didn't answer the ROG power command");
            }
        }
        return candidates;
    }
    async read(device) {
        const productId = Number(device.locator.productId);
        const reading = await this.readPower(productId, device.label);
        if (reading)
            return reading;
        const devices = await hidDevices(VENDOR_ID$1);
        const present = devices?.some((d) => d.productId === productId) ?? false;
        // Either way this is "not answering now", not "has no battery" — the
        // difference is only what to tell the user about why.
        return notFound(device.label, present ? "Device didn't answer the ROG power command" : "Device not connected");
    }
    /** Asks each vendor collection for the power frame; first valid answer wins. */
    async readPower(productId, label) {
        const devices = await hidDevices(VENDOR_ID$1);
        if (!devices)
            return null;
        const candidates = devices.filter((d) => d.productId === productId && d.path && REPORT_ID_BY_USAGE_PAGE.has(d.usagePage ?? 0));
        for (const info of candidates) {
            const reportId = REPORT_ID_BY_USAGE_PAGE.get(info.usagePage ?? 0);
            if (reportId === undefined)
                continue;
            const frame = await this.exchange(info, reportId);
            if (!frame)
                continue;
            const percent = frame[PERCENT_INDEX];
            const mirror = frame[PERCENT_MIRROR_INDEX];
            if (percent < 1 || percent > 100)
                continue;
            // The frame carries the level twice. They have always agreed on the
            // hardware this was derived from; if they ever don't, say so rather
            // than silently trusting one.
            if (mirror !== percent) {
                log.warn(`asus: power frame disagrees with itself ([${PERCENT_INDEX}]=${percent}, ` +
                    `[${PERCENT_MIRROR_INDEX}]=${mirror}, threshold=${frame[THRESHOLD_INDEX]}) — using ${percent}`);
            }
            return { deviceLabel: label, percent, status: "ok" };
        }
        return null;
    }
    /** Sends the power command on one collection and returns the reply frame. */
    exchange(info, reportId) {
        // null on a failure to open: the wrong collection for this id, or a busy
        // interface — either way the caller moves on to the next candidate.
        return withHidDevice(info.path, null, (device) => {
            const report = new Array(REPORT_LENGTH$1).fill(0);
            report[0] = reportId;
            report[1] = CMD_READ_INFO;
            report[2] = SUB_POWER;
            device.write(report);
            // The reply lands on the same handle that sent the command.
            const reply = device.readTimeout(REPLY_TIMEOUT_MS);
            if (!reply?.length)
                return null;
            const bytes = Array.from(reply);
            if (bytes[1] === ERROR_MARKER[0] && bytes[2] === ERROR_MARKER[1])
                return null;
            if (bytes[1] !== CMD_READ_INFO || bytes[2] !== SUB_POWER)
                return null;
            // A short frame reads as `undefined` at the level offsets, and neither
            // `undefined < 1` nor `undefined > 100` is true — so the caller's range
            // check would wave it through and report a level of `undefined`.
            if (bytes.length <= PERCENT_MIRROR_INDEX)
                return null;
            return bytes;
        });
    }
}
function kindOf$3(usagePage, usage, label) {
    if (usagePage === 0x01) {
        if (usage === USAGE_KEYBOARD$2)
            return "keyboard";
        if (usage === USAGE_MOUSE$2)
            return "mouse";
        if (usage === USAGE_GAMEPAD$2 || usage === USAGE_JOYSTICK$1)
            return "gamepad";
    }
    const name = label.toLowerCase();
    if (/keyboard|azoth|falchion|claymore|strix scope/.test(name))
        return "keyboard";
    if (/mouse|gladius|chakram|keris|spatha|harpe/.test(name))
        return "mouse";
    if (/headset|delta|cetra|fusion|theta/.test(name))
        return "headset";
    if (/gamepad|raikiri|tessen/.test(name))
        return "gamepad";
    return "other";
}

const VENDOR_SONY = 0x054c;
const PRODUCTS = new Map([
    [0x0ce6, { label: "DualSense Wireless Controller", family: "dualsense" }],
    [0x0df2, { label: "DualSense Edge Wireless Controller", family: "dualsense" }],
    [0x05c4, { label: "DualShock 4 Wireless Controller", family: "dualshock4" }],
    [0x09cc, { label: "DualShock 4 Wireless Controller", family: "dualshock4" }],
    [0x0ba0, { label: "DualShock 4 USB Wireless Adaptor", family: "dualshock4" }],
]);
/**
 * DualShock 4 input reports: 0x01 over USB, 0x11 over Bluetooth (which carries
 * two extra header bytes). One byte holds both the level and whether the cable
 * is in — the same idea as the PS5's status byte, in a different place.
 *
 *   [0..3] level, 0-10 on battery and 0-11 while charging
 *   [4]    cable state
 */
const REPORT_DS4_USB = 0x01;
const REPORT_DS4_BT = 0x11;
const STATUS_INDEX_DS4_USB = 30;
const STATUS_INDEX_DS4_BT = 32;
const DS4_CABLE = 0x10;
const DS4_LEVEL = 0x0f;
/**
 * Input report ids. Over USB the pad sends 0x01 with the full state; over
 * Bluetooth it starts in a compatibility mode that reuses id 0x01 for a short
 * report with no battery in it, and only sends the full state as id 0x31.
 */
const REPORT_USB = 0x01;
const REPORT_BT = 0x31;
/**
 * Offset of the status byte. The report body is identical on both transports;
 * the Bluetooth one just carries an extra header byte before it.
 *
 *   31 41 7e 85 7d 80 00 00 01 08 ... 08 ...
 *   |  |  |                           |
 *   |  |  +-- sticks (LX LY RX RY)    +-- [54] status: 0x08 = level 8, discharging
 *   |  +----- sequence / flags
 *   +-------- report id
 */
const STATUS_INDEX_USB = 53;
const STATUS_INDEX_BT = 54;
/**
 * Calibration data. Reading it is what makes a Bluetooth pad switch to the full
 * 0x31 report — the same thing any game does when it takes over the controller.
 * It is a GET_FEATURE, so nothing is written to the device.
 */
const FEATURE_CALIBRATION = 0x05;
const FEATURE_CALIBRATION_LENGTH = 41;
/** Reports stream continuously once the pad is in full mode, so this is generous. */
const READ_TIMEOUT_MS$1 = 120;
const READ_ATTEMPTS$1 = 8;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH$2 = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
/** Charge state, from the status byte's high nibble. */
const CHARGING$1 = 0x1;
const CHARGE_COMPLETE = 0x2;
const TEMPERATURE_ERROR = new Set([0xa, 0xb]);
const CHARGING_ERROR = 0xf;
/**
 * PlayStation 5 controllers, read straight from the pad's own input report.
 *
 * They need their own provider because neither of the OS-level routes works: a
 * DualSense pairs as Bluetooth Classic rather than LE, so Windows has no GATT
 * battery service to mirror into the PnP battery property the Bluetooth provider
 * reads, and over USB it's a plain HID gamepad with no battery usage.
 *
 * The layout below matches Linux's hid-playstation driver and was verified on a
 * DualSense over Bluetooth (status 0x08 = 85%, discharging).
 */
class DualSenseProvider {
    id = "dualsense";
    async discover() {
        const devices = await hidDevices(VENDOR_SONY);
        if (!devices)
            return [];
        const found = [];
        for (const info of devices) {
            if (!info.path || !PRODUCTS.has(info.productId))
                continue;
            const product = PRODUCTS.get(info.productId);
            const label = (info.product ?? "").trim() || product.label;
            const device = {
                // The serial number is the pad's MAC address over Bluetooth, so it
                // survives a reconnect and a reboot. USB doesn't always report one.
                key: `dualsense:${hex4(info.productId)}:${slug(info.serialNumber || info.path)}`,
                providerId: this.id,
                label,
                kind: "gamepad",
                supportsBattery: true,
                locator: {
                    productId: info.productId,
                    serialNumber: info.serialNumber ?? "",
                    family: product.family,
                },
            };
            device.reading = await this.readFrom(info, label, product.family);
            found.push(device);
        }
        return found;
    }
    async read(device) {
        const info = await this.locate(device);
        if (!info) {
            return {
                deviceLabel: device.label,
                percent: null,
                status: "not-found",
                detail: "Controller not connected",
            };
        }
        return this.readFrom(info, device.label, familyOf(info.productId));
    }
    /** Finds the pad again by serial, falling back to the product id. */
    async locate(device) {
        const devices = await hidDevices(VENDOR_SONY);
        if (!devices)
            return undefined;
        const productId = Number(device.locator.productId);
        const serialNumber = String(device.locator.serialNumber ?? "");
        const candidates = devices.filter((d) => d.path && d.productId === productId);
        return candidates.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? candidates[0];
    }
    async readFrom(info, label, family) {
        const status = await this.readStatusByte(info, family);
        if (status === null) {
            return {
                deviceLabel: label,
                percent: null,
                status: "error",
                detail: "Controller didn't send a full input report",
            };
        }
        return family === "dualsense" ? decodeStatus(status, label) : decodeDualShock4(status, label);
    }
    /**
     * Opens the pad, waits for a report that actually carries the battery, and
     * returns its status byte.
     */
    async readStatusByte(info, family) {
        const overBluetooth = BLUETOOTH_PATH$2.test(info.path ?? "");
        // null on a failure to open: busy, disconnected mid-read, or no permission
        // for this interface.
        return withHidDevice(info.path, null, (device) => {
            let askedForFullReports = false;
            for (let attempt = 0; attempt < READ_ATTEMPTS$1; attempt++) {
                const report = device.readTimeout(READ_TIMEOUT_MS$1);
                if (!report?.length)
                    continue;
                const bytes = Array.from(report);
                const index = statusIndexOf(bytes, overBluetooth, family);
                if (index !== null && bytes.length > index)
                    return bytes[index];
                // A Bluetooth pad in compatibility mode pads its short report out to
                // the full length, so length alone can't tell them apart — the report
                // id can. Ask for the calibration data once; that flips it to the full
                // report (0x31 on a DualSense, 0x11 on a DualShock 4).
                if (overBluetooth && !askedForFullReports) {
                    askedForFullReports = true;
                    try {
                        device.getFeatureReport(FEATURE_CALIBRATION, FEATURE_CALIBRATION_LENGTH);
                    }
                    catch {
                        // Some stacks refuse feature reads; the next attempts still stand
                        // a chance if something else already switched the pad over.
                    }
                }
            }
            return null;
        });
    }
}
function familyOf(productId) {
    return PRODUCTS.get(productId)?.family ?? "dualsense";
}
/** Which byte holds the status, or null when this report doesn't carry one. */
function statusIndexOf(bytes, overBluetooth, family) {
    if (family === "dualshock4") {
        if (overBluetooth)
            return bytes[0] === REPORT_DS4_BT ? STATUS_INDEX_DS4_BT : null;
        return bytes[0] === REPORT_DS4_USB ? STATUS_INDEX_DS4_USB : null;
    }
    if (overBluetooth)
        return bytes[0] === REPORT_BT ? STATUS_INDEX_BT : null;
    return bytes[0] === REPORT_USB ? STATUS_INDEX_USB : null;
}
/**
 * DualShock 4: one nibble for the level, one bit for the cable.
 *
 * The scale changes with the cable — 0-10 on battery, 0-11 while charging —
 * which is why the two cases divide by different totals. Unverified against
 * hardware; the layout is the one Linux's hid-sony driver uses.
 */
function decodeDualShock4(status, label) {
    const level = status & DS4_LEVEL;
    const cable = (status & DS4_CABLE) !== 0;
    if (cable) {
        if (level >= 11) {
            return { deviceLabel: label, percent: 100, status: "charging", detail: "Charge complete" };
        }
        return { deviceLabel: label, percent: clampPercent((level / 11) * 100), status: "charging" };
    }
    return { deviceLabel: label, percent: clampPercent((level / 10) * 100), status: "ok" };
}
/**
 * Low nibble is the level in units of 10%, high nibble is the charge state.
 * Sony reports the level in 11 steps (0-10), which the +5 centres on the middle
 * of each step rather than its floor.
 */
function decodeStatus(status, label) {
    const level = status & 0x0f;
    const state = (status >> 4) & 0x0f;
    const percent = clampPercent(level * 10 + 5);
    // Both charge states mean the cable is attached, so both show the charging
    // indicator — the same call logitech.ts makes for its "charge complete".
    // Sony reports "complete" well before the gauge reads full (0x28 = complete
    // at level 8), so the pad's own level is kept rather than rounded up to 100.
    // A level of 0 alongside "complete" is the one case that can't be meant
    // literally.
    if (state === CHARGE_COMPLETE) {
        return {
            deviceLabel: label,
            percent: level === 0 ? 100 : percent,
            status: "charging",
            detail: "Charge complete",
        };
    }
    if (state === CHARGING$1) {
        return { deviceLabel: label, percent, status: "charging" };
    }
    if (TEMPERATURE_ERROR.has(state)) {
        return { deviceLabel: label, percent, status: "error", detail: "Battery temperature out of range" };
    }
    if (state === CHARGING_ERROR) {
        return { deviceLabel: label, percent, status: "error", detail: "Controller reported a charging error" };
    }
    return { deviceLabel: label, percent, status: "ok" };
}

const VENDOR_MICROSOFT = 0x045e;
/** HID usage page 0x01 (Generic Desktop), gamepad. */
const USAGE_PAGE_DESKTOP = 0x01;
const USAGE_GAMEPAD$1 = 0x05;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH$1 = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
/**
 * Battery arrives as its own input report, id 0x04, carrying one byte of flags.
 * This is the layout Linux's xpadneo driver decodes:
 *
 *   bit 7    online
 *   bit 4    charging
 *   bits 3-2 supply kind (internal, AA cells, rechargeable pack)
 *   bits 1-0 capacity: 0 critical, 1 low, 2 medium, 3 full
 *
 * Note what's missing: a percentage. The pad reports four steps, so the numbers
 * below are the middle of each step rather than a reading — a key showing "70%"
 * for an Xbox pad means "medium", and it will sit there until the step changes.
 */
const REPORT_BATTERY = 0x04;
const ONLINE = 0x80;
const CHARGING = 0x10;
const CAPACITY = 0x03;
const CAPACITY_STEPS = [
    { percent: 10, word: "Critical" },
    { percent: 35, word: "Low" },
    { percent: 70, word: "Medium" },
    { percent: 100, word: "Full" },
];
/**
 * The pad sends this report when the level changes, not on a schedule, so a
 * quiet controller may not send one while we're listening. Kept short on
 * purpose: discovery runs while the property inspector waits.
 */
const READ_TIMEOUT_MS = 200;
const READ_ATTEMPTS = 2;
/**
 * Xbox Wireless Controllers paired over Bluetooth.
 *
 * No model list: any Microsoft gamepad on a Bluetooth path is tried, so an Xbox
 * One S pad and a Series X|S pad both work through the same code, as should
 * whatever ships next.
 *
 * Only Bluetooth. Connected through the Xbox Wireless dongle or a USB cable,
 * the controller speaks GIP rather than HID, and its battery isn't in a report
 * this can read — see "Xbox controllers" in the README.
 *
 * Unverified against hardware: written from xpadneo's decoding rather than from
 * a pad on the bench. `scripts/xbox-probe.mjs` prints what a real one sends.
 */
class XboxProvider {
    id = "xbox";
    async discover() {
        const devices = await hidDevices(VENDOR_MICROSOFT);
        if (!devices)
            return [];
        const found = [];
        for (const info of devices) {
            if (!isXboxPad(info))
                continue;
            const label = (info.product ?? "").trim() || "Xbox Wireless Controller";
            const reading = await this.readFrom(info, label);
            found.push({
                key: `xbox:${slug(info.serialNumber || info.path || label)}`,
                providerId: this.id,
                label,
                kind: "gamepad",
                supportsBattery: reading.percent !== null,
                locator: { serialNumber: info.serialNumber ?? "", path: info.path ?? "" },
                reading,
            });
        }
        return found;
    }
    async read(device) {
        const devices = await hidDevices(VENDOR_MICROSOFT);
        const serialNumber = String(device.locator.serialNumber ?? "");
        const pads = devices?.filter(isXboxPad) ?? [];
        const info = pads.find((d) => serialNumber !== "" && d.serialNumber === serialNumber) ?? pads[0];
        if (!info) {
            return notFound(device.label, "Controller not connected");
        }
        return this.readFrom(info, device.label);
    }
    async readFrom(info, label) {
        const failed = {
            deviceLabel: label,
            percent: null,
            status: "error",
            detail: "Controller couldn't be opened",
        };
        return withHidDevice(info.path, failed, (device) => {
            // Ask outright first: it costs nothing and doesn't depend on the pad
            // happening to send an update while we listen.
            try {
                const feature = device.getFeatureReport(REPORT_BATTERY, 2);
                if (feature?.length >= 2)
                    return decodeBattery(feature[1], label);
            }
            catch {
                // Not every firmware answers a feature read for this report.
            }
            for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
                const report = device.readTimeout(READ_TIMEOUT_MS);
                if (report?.length && report[0] === REPORT_BATTERY && report.length >= 2) {
                    return decodeBattery(report[1], label);
                }
            }
            return unsupported(label, "Connected, but it didn't send a battery report");
        }, `xbox: ${label}`);
    }
}
/** A Microsoft gamepad on a Bluetooth path — no model list involved. */
function isXboxPad(info) {
    return (info.path !== undefined &&
        info.vendorId === VENDOR_MICROSOFT &&
        info.usagePage === USAGE_PAGE_DESKTOP &&
        info.usage === USAGE_GAMEPAD$1 &&
        BLUETOOTH_PATH$1.test(info.path));
}
function decodeBattery(flags, label) {
    if ((flags & ONLINE) === 0) {
        return notFound(label, "Controller is offline");
    }
    const step = CAPACITY_STEPS[flags & CAPACITY];
    return {
        deviceLabel: label,
        percent: step.percent,
        status: (flags & CHARGING) !== 0 ? "charging" : "ok",
        detail: `${step.word} — the pad reports four steps, not a percentage`,
    };
}

/** Vendors a dedicated provider already enumerates, with its own battery protocol. */
const CLAIMED_VENDORS = new Set([
    0x046d, // Logitech — logitech.ts
    0x0b05, // ASUSTek — asus.ts
    0x054c, // Sony — dualsense.ts
    0x1532, // Razer — razer.ts
]);
/** The Stream Deck running this plugin is not a device anyone wants on a key. */
const ELGATO = 0x0fd9;
/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_MOUSE$1 = 0x02;
const USAGE_JOYSTICK = 0x04;
const USAGE_GAMEPAD = 0x05;
const USAGE_KEYBOARD$1 = 0x06;
/** Bluetooth HID service UUIDs, which Windows puts in the device path. */
const BLUETOOTH_PATH = /\{0000112[45]-0000-1000-8000-00805f9b34fb\}/i;
/**
 * Names that suggest the USB thing enumerating is a radio for something else,
 * so its "plugged in" status says nothing about the peripheral's battery.
 */
const RECEIVER_NAME = /wireless|receiver|dongle|lightspeed|bolt|2\.4\s*g/i;
/**
 * Catch-all: lists every remaining HID device so nothing is invisible, even
 * though none of them report a battery through a protocol this plugin knows.
 *
 * Cable-powered devices are reported as running on mains rather than as a
 * failure to read a battery — a wired keyboard has no battery to be missing.
 * Anything wireless, or anything whose name suggests it's a receiver for a
 * wireless peripheral, is left as "unsupported" instead: there may well be a
 * battery there, this plugin just can't see it.
 */
class GenericHidProvider {
    id = "hid";
    async discover() {
        const devices = await hidDevices();
        if (!devices)
            return [];
        // One physical device exposes several HID interfaces; collapse to one entry
        // per vendor/product, preferring an interface that names a form factor.
        const byProduct = new Map();
        for (const info of devices) {
            if (!info.path)
                continue;
            if (CLAIMED_VENDORS.has(info.vendorId) || info.vendorId === ELGATO)
                continue;
            // Only the pad is claimed, not all of Microsoft's mice and keyboards.
            if (isXboxPad(info))
                continue;
            const id = `${hex4(info.vendorId)}:${hex4(info.productId)}`;
            const kind = kindOf$2(info);
            const existing = byProduct.get(id);
            if (existing && (existing.kind !== "other" || kind === "other"))
                continue;
            const label = labelOf$1(info);
            byProduct.set(id, {
                key: `hid:${id}`,
                providerId: this.id,
                label,
                kind,
                supportsBattery: false,
                locator: { vendorId: info.vendorId, productId: info.productId },
                reading: readingFor(info, label),
            });
        }
        return [...byProduct.values()];
    }
    async read(device) {
        const devices = await hidDevices();
        const match = devices?.find((d) => d.vendorId === Number(device.locator.vendorId) && d.productId === Number(device.locator.productId));
        if (!match) {
            return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Device not connected" };
        }
        return readingFor(match, device.label);
    }
}
function readingFor(info, label) {
    const wireless = BLUETOOTH_PATH.test(info.path ?? "") || RECEIVER_NAME.test(label);
    if (wireless) {
        return {
            deviceLabel: label,
            percent: null,
            status: "unsupported",
            detail: "Detected, but it reports no battery this plugin can read",
        };
    }
    return { deviceLabel: label, percent: null, status: "mains", detail: "Powered over its cable" };
}
function labelOf$1(info) {
    const product = (info.product ?? "").trim();
    const manufacturer = (info.manufacturer ?? "").trim();
    if (product && manufacturer && !product.toLowerCase().startsWith(manufacturer.toLowerCase())) {
        return `${manufacturer} ${product}`;
    }
    return product || manufacturer || `HID device ${hex4(info.vendorId)}:${hex4(info.productId)}`;
}
function kindOf$2(info) {
    if (info.usagePage === 0x01) {
        if (info.usage === USAGE_KEYBOARD$1)
            return "keyboard";
        if (info.usage === USAGE_MOUSE$1)
            return "mouse";
        if (info.usage === USAGE_GAMEPAD || info.usage === USAGE_JOYSTICK)
            return "gamepad";
    }
    // Model names, since a gaming peripheral rarely says what it is: an "Arctis
    // Nova Pro" or a "Scimitar" names itself and nothing else.
    const name = (info.product ?? "").toLowerCase();
    if (/keyboard|keypad|k[0-9]{2,3}\b|apex|strafe|huntsman|blackwidow|keychron/.test(name))
        return "keyboard";
    if (/mouse|trackball|rival|sensei|aerox|scimitar|harpoon|ironclaw|dark core|model o|model d/.test(name)) {
        return "mouse";
    }
    if (/buds|earbud|airpods|hammerhead/.test(name))
        return "earbuds";
    if (/headset|headphone|cloud|arctis|virtuoso|void|kraken|barracuda|stealth|blackshark|nova\b/.test(name)) {
        return "headset";
    }
    if (/controller|gamepad|joystick|wolverine|raiju/.test(name))
        return "gamepad";
    if (/mic\b|microphone|solocast|quadcast|yeti|wave|seiren|blue\b/.test(name))
        return "microphone";
    if (/speaker|soundbar|nommo|leviathan/.test(name))
        return "speaker";
    if (/watch|band\b/.test(name))
        return "watch";
    return "other";
}

/**
 * Turns an expensive fetch into one that several callers can share.
 *
 * The two exec-based providers each run a command that already returns *every*
 * device it knows about, but they were called once per key: eight keys bound to
 * the same provider meant eight `powershell.exe` processes on every poll tick,
 * all asking the same question. This holds the answer for a moment and hands the
 * same in-flight promise to anyone who asks while it's still running.
 *
 * The same shape as the cache in {@link DeviceDiscovery}, extracted because a
 * second and third copy of it were about to be written.
 */
function coalesce(fetch, ttlMs) {
    let cache;
    let inflight;
    return () => {
        if (cache && Date.now() - cache.at < ttlMs)
            return Promise.resolve(cache.value);
        inflight ??= fetch()
            .then((value) => {
            cache = { at: Date.now(), value };
            return value;
        })
            .finally(() => {
            inflight = undefined;
        });
        return inflight;
    };
}

/** Shared by the provider and the free functions its parsing was split into. */
const PROVIDER_ID = "headset";
const execFileAsync$2 = node_util.promisify(node_child_process.execFile);
const TIMEOUT_MS$2 = 6000;
/**
 * How long one CLI result is reused. Short for the same reason as its Bluetooth
 * counterpart: it collapses the rescan-then-read pair a single key press causes,
 * without holding a level long enough for anyone to see it go stale.
 *
 * {@link findHeadsetControl} deliberately doesn't share this — the panel calls it
 * to answer "is the tool installed?", and someone who has just installed it and
 * hit refresh needs a real answer, not a cached "no".
 */
const RUN_TTL_MS = 2000;
/**
 * Candidate locations for the HeadsetControl binary, tried in order. A bare
 * name ("headsetcontrol.exe") relies on PATH; the fully-qualified paths are the
 * default install locations so the plugin keeps working even when Stream Deck's
 * process environment doesn't have our PATH change (a fresh PATH entry isn't
 * picked up by the already-running, often-elevated Stream Deck app until the
 * user fully signs out/in).
 */
function candidateBinaries() {
    if (process.env.HEADSETCONTROL_PATH)
        return [process.env.HEADSETCONTROL_PATH];
    if (process.platform === "win32") {
        const localAppData = process.env.LOCALAPPDATA ?? path.join(node_os.homedir(), "AppData", "Local");
        const paths = ["headsetcontrol.exe", path.join(localAppData, "Programs", "HeadsetControl", "headsetcontrol.exe")];
        if (process.env.ProgramFiles)
            paths.push(path.join(process.env.ProgramFiles, "HeadsetControl", "headsetcontrol.exe"));
        return paths;
    }
    return [
        "headsetcontrol",
        "/opt/homebrew/bin/headsetcontrol",
        "/usr/local/bin/headsetcontrol",
        "/usr/bin/headsetcontrol",
    ];
}
/** Where to send someone who hasn't got the tool yet. */
const HEADSETCONTROL_RELEASES = "https://github.com/Sapd/HeadsetControl/releases";
/**
 * Which binary is going to be used, or null when none of the candidates exist.
 *
 * The property inspector asks this so it can say whether headsets will report
 * anything at all — a missing HeadsetControl is the single most common reason
 * for a headset showing no level, and it looks identical to an unsupported
 * device unless the panel says so.
 */
async function findHeadsetControl() {
    for (const binary of candidateBinaries()) {
        try {
            await execFileAsync$2(binary, ["--help"], { timeout: TIMEOUT_MS$2, windowsHide: true });
            return binary;
        }
        catch (err) {
            // Anything other than "no such file" means it's there and answered.
            if (err?.code !== "ENOENT")
                return binary;
        }
    }
    return null;
}
/**
 * A JSON field as a string, or "" for anything that isn't one.
 *
 * HeadsetControl's output shape has changed across releases (see {@link
 * HeadsetControlProvider.parse}), so a field that's a string today may be an
 * object or a number tomorrow. Coercing here keeps a surprise from reaching
 * `slug()` or a `.trim()` further down, where it would throw.
 */
function text(value) {
    return typeof value === "string" ? value : "";
}
/**
 * Wireless headsets have no public API/SDK (NGENUITY and friends don't expose
 * one), so we shell out to HeadsetControl — https://github.com/Sapd/HeadsetControl —
 * an open-source CLI that has already reverse-engineered the battery HID report
 * for ~100 headsets and ships prebuilt Windows/macOS/Linux binaries.
 *
 * Whatever HeadsetControl reports is what we list: no headset model is hard-coded
 * here, so plugging in a different supported headset just makes it show up.
 */
class HeadsetControlProvider {
    id = PROVIDER_ID;
    async discover() {
        const output = await this.run();
        if (!output.ok)
            return [];
        try {
            return parseDevices(output.stdout);
        }
        catch (err) {
            // The contract is that a scan never throws: one provider tripping over an
            // unfamiliar payload must not cost the user every other device.
            log.warn(`headsetcontrol: could not read the device list: ${String(err)}`);
            return [];
        }
    }
    async read(device) {
        const label = device.label;
        const output = await this.run();
        if (!output.ok) {
            return { deviceLabel: label, percent: null, status: "error", detail: output.detail };
        }
        let match;
        try {
            match = parseDevices(output.stdout).find((d) => d.key === device.key);
        }
        catch (err) {
            log.warn(`headsetcontrol: could not read ${device.key}: ${String(err)}`);
            return { deviceLabel: label, percent: null, status: "error", detail: "Unreadable HeadsetControl output" };
        }
        if (!match?.reading) {
            return { deviceLabel: label, percent: null, status: "not-found", detail: "Headset offline or asleep" };
        }
        return match.reading;
    }
    /**
     * One CLI run serves every key. `-b` already reports every headset it can
     * see, so asking once per key only multiplied the process count — and each
     * ask re-probed the candidate paths before it could even start.
     */
    run = coalesce(() => this.exec(), RUN_TTL_MS);
    /** Runs the CLI at the first candidate path that exists. */
    async exec() {
        let lastError;
        for (const binary of candidateBinaries()) {
            try {
                const { stdout } = await execFileAsync$2(binary, ["-o", "JSON", "-b"], {
                    timeout: TIMEOUT_MS$2,
                    windowsHide: true,
                });
                return { ok: true, stdout };
            }
            catch (err) {
                // ENOENT just means this candidate path doesn't exist — try the next one.
                if (err?.code === "ENOENT")
                    continue;
                // A non-zero exit still prints usable JSON on some versions.
                if (typeof err?.stdout === "string" && err.stdout.trim().startsWith("{")) {
                    return { ok: true, stdout: err.stdout };
                }
                lastError = String(err?.message ?? err);
            }
        }
        return {
            ok: false,
            detail: lastError ?? "HeadsetControl not found. Install it: https://github.com/Sapd/HeadsetControl/releases",
        };
    }
}
/**
 * Accepts both the v3 shape (`{devices:[{device,vendor,product,battery:{...}}]}`)
 * and the older nested one (`{devices:[{device,status:{battery:{...}}}]}`).
 */
function parseDevices(stdout) {
    let json;
    try {
        json = JSON.parse(stdout);
    }
    catch {
        // Very old builds print plain text like "Battery: 75%". No device name
        // to key off, so expose it as a single generic entry.
        const match = stdout.match(/(\d{1,3})\s*%/);
        if (!match)
            return [];
        const label = "Headset";
        return [
            {
                key: "headset:unknown",
                providerId: PROVIDER_ID,
                label,
                kind: "headset",
                supportsBattery: true,
                locator: {},
                reading: { deviceLabel: label, percent: Number(match[1]), status: "ok" },
            },
        ];
    }
    const raw = Array.isArray(json?.devices) ? json.devices : Array.isArray(json) ? json : [json];
    return raw
        .filter((d) => d && typeof d === "object")
        .map((d) => toDevice(d))
        .filter((d) => d !== null);
}
function toDevice(raw) {
    const vendor = text(raw.vendor);
    const product = text(raw.product);
    const label = text(raw.device) || [vendor, product].filter(Boolean).join(" ") || text(raw.name) || "Headset";
    const idVendor = text(raw.id_vendor ?? raw.idVendor);
    const idProduct = text(raw.id_product ?? raw.idProduct);
    const key = idVendor && idProduct ? `headset:${idVendor}:${idProduct}` : `headset:${slug(label) || "unknown"}`;
    return {
        key,
        providerId: PROVIDER_ID,
        label,
        kind: "headset",
        supportsBattery: true,
        locator: { idVendor, idProduct },
        reading: toReading$1(label, raw),
    };
}
function toReading$1(label, raw) {
    const battery = raw.battery ?? raw.status?.battery;
    if (!battery || typeof battery !== "object")
        return undefined;
    if (battery.level === undefined || battery.level === null)
        return undefined;
    // HeadsetControl explains itself ("Device is offline or not responding"),
    // which beats anything we'd guess at.
    const reported = text(raw.errors?.battery);
    const offline = reported
        ? `Headset offline: ${reported}`
        : "Headset offline or asleep — the dongle is connected but the headset isn't answering";
    const status = String(battery.status ?? "");
    if (status === "BATTERY_UNAVAILABLE" || status === "BATTERY_TIMEOUT" || status === "BATTERY_HIDERROR") {
        return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
    }
    const percent = Number(battery.level);
    if (!Number.isFinite(percent) || percent < 0) {
        return { deviceLabel: label, percent: null, status: "not-found", detail: offline };
    }
    return {
        deviceLabel: label,
        percent: clampPercent(percent),
        status: status === "BATTERY_CHARGING" ? "charging" : "ok",
    };
}

const VENDOR_ID = 0x046d;
/**
 * The HID++ endpoint is a vendor-defined usage page (0xff00) exposing two
 * collections: usage 0x01 carries the 7-byte short reports, usage 0x02 the
 * 20-byte long ones. Windows hands out a separate handle per collection and
 * rejects a report id that the handle's collection doesn't declare, so both
 * have to be opened and each request written to the matching one.
 */
const HIDPP_USAGE_PAGE = 0xff00;
const HIDPP_USAGE_SHORT = 0x01;
const HIDPP_USAGE_LONG = 0x02;
const SHORT_REPORT_ID = 0x10;
const SHORT_LEN = 7;
const LONG_REPORT_ID = 0x11;
const LONG_LEN = 20;
const SW_ID = 0x0a; // arbitrary nonzero software id, echoed back in responses
const ERR_HIDPP10 = 0x8f;
const ERR_HIDPP20 = 0xff;
const FEATURE_ROOT = 0x0000;
const FEATURE_DEVICE_INFO = 0x0003;
const FEATURE_DEVICE_NAME = 0x0005;
const FEATURE_BATTERY_LEGACY = 0x1000;
const FEATURE_BATTERY_UNIFIED = 0x1004;
const RESPONSE_TIMEOUT_MS = 250;
/**
 * A device that's been sitting still is in power-save and answers its first
 * ping late, if at all — a mouse nobody has touched for a minute needs longer
 * than one that was just moved. Battery reads therefore wait longer and ask
 * twice, while everything else keeps the short timeout: discovery probes empty
 * receiver slots, and each of those costs a full timeout with nothing to show
 * for it.
 */
const BATTERY_TIMEOUT_MS = 700;
const BATTERY_ATTEMPTS = 2;
const PING_MARKER = 0x5a;
/**
 * Device indices to probe on each HID++ endpoint. 0xff addresses a directly
 * connected device (cable/Bluetooth); 1..6 are the pairing slots of a Unifying
 * or Lightspeed receiver. An absent slot costs one timeout, a present-but-empty
 * one answers with an error immediately.
 */
const DEVICE_INDICES = [0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06];
/** Device type codes from feature 0x0005 getDeviceType. */
const DEVICE_TYPES = {
    0: { name: "Keyboard", kind: "keyboard" },
    1: { name: "Remote control", kind: "other" },
    2: { name: "Numpad", kind: "keyboard" },
    3: { name: "Mouse", kind: "mouse" },
    4: { name: "Touchpad", kind: "mouse" },
    5: { name: "Trackball", kind: "mouse" },
    6: { name: "Presenter", kind: "other" },
    7: { name: "Receiver", kind: "other" },
    8: { name: "Headset", kind: "headset" },
    9: { name: "Webcam", kind: "other" },
    10: { name: "Steering wheel", kind: "gamepad" },
    11: { name: "Joystick", kind: "gamepad" },
    12: { name: "Gamepad", kind: "gamepad" },
    13: { name: "Dock", kind: "other" },
    14: { name: "Speaker", kind: "speaker" },
    15: { name: "Microphone", kind: "microphone" },
    16: { name: "Illumination light", kind: "other" },
    17: { name: "Programmable controller", kind: "other" },
    18: { name: "Car sim pedals", kind: "gamepad" },
    19: { name: "Adapter", kind: "other" },
};
/**
 * Logitech wireless peripherals speak HID++ 2.0 over their receiver or directly
 * over Bluetooth. There is no vendor API (G HUB / Options+ expose none), so this
 * implements the protocol directly, following the reverse-engineered spec
 * documented by the Solaar and libratbag projects:
 *
 *   0x0000 Root            . getFeature(id)  -> resolves a feature to its index
 *   0x0003 Device Info     . getDeviceInfo() -> unit id (stable per unit)
 *   0x0005 Device Name     . getDeviceName() -> the device's own product name
 *   0x1004 Unified Battery . getStatus()     -> level %, charging state
 *   0x1000 Battery (legacy). getLevelStatus() -> level %, charging state
 *
 * Every device paired to every Logitech receiver on the machine is enumerated;
 * names and form factors come from the devices themselves, so no model is
 * hard-coded here.
 */
class LogitechProvider {
    id = "logitech";
    async discover() {
        const endpoints = await hidppEndpoints();
        const found = [];
        const seen = new Set();
        for (const endpoint of endpoints) {
            await withLink(endpoint, async (link) => {
                for (const deviceIndex of DEVICE_INDICES) {
                    const probed = await this.probe(link, deviceIndex, endpoint);
                    if (probed && !seen.has(probed.key)) {
                        seen.add(probed.key);
                        found.push(probed);
                    }
                }
            });
        }
        return found;
    }
    async read(device) {
        const productId = Number(device.locator.productId);
        const deviceIndex = Number(device.locator.deviceIndex);
        const endpoints = (await hidppEndpoints()).filter((e) => e.productId === productId);
        if (endpoints.length === 0) {
            return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Receiver not connected" };
        }
        let result = null;
        for (const endpoint of endpoints) {
            if (result)
                break;
            await withLink(endpoint, async (link) => {
                if (!(await ping(link, deviceIndex, BATTERY_TIMEOUT_MS, BATTERY_ATTEMPTS)))
                    return;
                const feature = await findBatteryFeature(link, deviceIndex);
                if (!feature) {
                    result = {
                        deviceLabel: device.label,
                        percent: null,
                        status: "unsupported",
                        detail: "Device exposes no HID++ battery feature",
                    };
                    return;
                }
                result = await readBattery(link, deviceIndex, feature, device.label);
            });
        }
        return (result ?? {
            deviceLabel: device.label,
            percent: null,
            status: "not-found",
            detail: "No answer after two tries — powered off or out of range",
        });
    }
    async probe(link, deviceIndex, endpoint) {
        if (!(await ping(link, deviceIndex)))
            return null;
        const nameIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_NAME);
        const name = nameIndex ? await readName(link, deviceIndex, nameIndex) : null;
        const typeCode = nameIndex ? await readDeviceType(link, deviceIndex, nameIndex) : null;
        const type = typeCode !== null ? DEVICE_TYPES[typeCode] : undefined;
        // A receiver answering for itself isn't a battery-bearing peripheral.
        if (type?.name === "Receiver")
            return null;
        const feature = await findBatteryFeature(link, deviceIndex);
        if (!name && !feature)
            return null;
        const label = name ?? `Logitech device ${hex4(endpoint.productId)}:${deviceIndex}`;
        const unitId = await readUnitId(link, deviceIndex);
        const key = unitId ? `logitech:${unitId}` : `logitech:${hex4(endpoint.productId)}:${deviceIndex.toString(16)}`;
        const reading = feature
            ? await readBattery(link, deviceIndex, feature, label)
            : {
                deviceLabel: label,
                percent: null,
                status: "unsupported",
                detail: "Device exposes no HID++ battery feature",
            };
        return {
            key,
            providerId: this.id,
            label,
            kind: type?.kind ?? "other",
            supportsBattery: feature !== null,
            locator: { productId: endpoint.productId, deviceIndex },
            reading,
        };
    }
}
/**
 * Collapses the per-collection HID paths Windows reports back into one entry per
 * physical endpoint: `...&MI_02&Col01#9&1b0e509f&0&0000#{guid}` and its `Col02`
 * sibling differ only in the collection index and the trailing instance number.
 * Platforms that expose a single node per interface fall out as one group each.
 */
function endpointKey(path) {
    return path
        .replace(/&Col\d+/i, "")
        .replace(/#\{[0-9a-f-]+\}$/i, "")
        .replace(/&\d{4}$/, "");
}
/** Every Logitech HID++ endpoint on the machine. */
async function hidppEndpoints() {
    const devices = await hidDevices(VENDOR_ID);
    if (!devices)
        return [];
    const withPath = devices.filter((d) => !!d.path);
    const vendorCollections = withPath.filter((d) => d.usagePage === HIDPP_USAGE_PAGE);
    // Some platforms/drivers don't report usagePage; then try every interface.
    const pool = vendorCollections.length > 0 ? vendorCollections : withPath.filter((d) => d.usagePage === undefined);
    const endpoints = new Map();
    for (const info of pool) {
        const key = endpointKey(info.path);
        const endpoint = endpoints.get(key) ?? { key, productId: info.productId };
        if (info.usage === HIDPP_USAGE_LONG)
            endpoint.long = info;
        else if (info.usage === HIDPP_USAGE_SHORT)
            endpoint.short = info;
        else
            endpoint.short ??= info; // platform doesn't split collections
        endpoints.set(key, endpoint);
    }
    // A real HID++ endpoint always offers the long-report collection. Requiring it
    // discards other 0xff00 vendor interfaces that would otherwise cost a timeout
    // per probed device index (a Logitech webcam, for instance).
    const all = [...endpoints.values()];
    return all.some((e) => e.long) ? all.filter((e) => e.long) : all;
}
/**
 * A HID++ endpoint with both collections open. Requests go out on the handle
 * whose collection declares the report id; replies are accepted from either,
 * since a short request can be answered with a long report.
 */
class HidppLink {
    short;
    long;
    constructor(short, long) {
        this.short = short;
        this.long = long;
    }
    get usable() {
        return !!(this.short || this.long);
    }
    /**
     * Sends one request and waits for the matching response. Resolves null on an
     * error response or timeout, so callers can treat "unsupported" and "absent"
     * the same way.
     */
    request(deviceIndex, featureIdx, functionId, params = [], preferLong = false, timeoutMs = RESPONSE_TIMEOUT_MS) {
        const target = preferLong ? (this.long ?? this.short) : (this.short ?? this.long);
        if (!target)
            return Promise.resolve(null);
        const long = target === this.long;
        const length = long ? LONG_LEN : SHORT_LEN;
        const report = new Array(length).fill(0);
        const funcByte = ((functionId & 0x0f) << 4) | SW_ID;
        report[0] = long ? LONG_REPORT_ID : SHORT_REPORT_ID;
        report[1] = deviceIndex;
        report[2] = featureIdx;
        report[3] = funcByte;
        for (let i = 0; i < params.length && 4 + i < length; i++)
            report[4 + i] = params[i] & 0xff;
        const listeners = [this.short, this.long].filter((d) => !!d);
        return new Promise((resolve) => {
            let settled = false;
            // Declared up here because `finish` below closes over it, and `finish`
            // has to exist before the listener that can call it is registered.
            // eslint-disable-next-line prefer-const
            let timer;
            const finish = (value) => {
                if (settled)
                    return;
                settled = true;
                clearTimeout(timer);
                for (const device of listeners)
                    device.removeListener("data", onData);
                resolve(value);
            };
            const onData = (data) => {
                const bytes = Array.from(data);
                if (bytes[1] !== deviceIndex)
                    return;
                // Success: same feature index and same function/software id echoed back.
                if (bytes[2] === featureIdx && bytes[3] === funcByte)
                    finish(bytes);
                // Error: 0x8f (HID++ 1.0) / 0xff (HID++ 2.0), original request in bytes 3-4.
                else if ((bytes[2] === ERR_HIDPP20 || bytes[2] === ERR_HIDPP10) &&
                    bytes[3] === featureIdx &&
                    bytes[4] === funcByte)
                    finish(null);
            };
            for (const device of listeners)
                device.on("data", onData);
            timer = setTimeout(() => finish(null), timeoutMs);
            try {
                target.write(report);
            }
            catch {
                finish(null);
            }
        });
    }
}
async function withLink(endpoint, fn) {
    const HID = await loadHid();
    if (!HID)
        return;
    const open = (info) => {
        if (!info?.path)
            return undefined;
        try {
            return new HID.HID(info.path);
        }
        catch {
            // Interface busy (G HUB holds some exclusively) or gone.
            return undefined;
        }
    };
    const short = open(endpoint.short);
    const long = open(endpoint.long);
    try {
        const link = new HidppLink(short, long);
        if (link.usable)
            await fn(link);
    }
    catch {
        // A provider must never take down a scan.
    }
    finally {
        for (const device of [short, long]) {
            try {
                device?.close();
            }
            catch {
                /* already closed */
            }
        }
    }
}
/** Root.getProtocolVersion, used as a cheap "is anything on this index?" probe. */
/**
 * Checks a device is there and awake.
 *
 * Discovery uses the default short timeout, because it pings all seven slots on
 * every endpoint and an empty one can only be identified by the timeout. Reading
 * a device we already know exists is the opposite case: it's worth waiting, and
 * worth asking twice, since the first ping is often what wakes the radio.
 */
async function ping(link, deviceIndex, timeoutMs = RESPONSE_TIMEOUT_MS, attempts = 1) {
    for (let attempt = 0; attempt < attempts; attempt++) {
        const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x01, [0x00, 0x00, PING_MARKER], false, timeoutMs);
        if (resp !== null && resp[6] === PING_MARKER)
            return true;
    }
    return false;
}
async function featureIndex(link, deviceIndex, featureId) {
    const resp = await link.request(deviceIndex, FEATURE_ROOT, 0x00, [(featureId >> 8) & 0xff, featureId & 0xff, 0x00]);
    if (!resp)
        return null;
    const index = resp[4];
    return index > 0 ? index : null;
}
async function findBatteryFeature(link, deviceIndex) {
    const unified = await featureIndex(link, deviceIndex, FEATURE_BATTERY_UNIFIED);
    if (unified)
        return { index: unified, unified: true };
    const legacy = await featureIndex(link, deviceIndex, FEATURE_BATTERY_LEGACY);
    if (legacy)
        return { index: legacy, unified: false };
    return null;
}
async function readBattery(link, deviceIndex, feature, label) {
    if (feature.unified) {
        // getStatus() -> stateOfCharge, batteryLevel, chargingStatus, externalPower
        const resp = await requestBattery(link, deviceIndex, feature.index, 0x01);
        if (resp) {
            const percent = resp[4];
            const chargingStatus = resp[6];
            if (percent >= 0 && percent <= 100) {
                return {
                    deviceLabel: label,
                    percent,
                    // 0 discharging, 1 charging, 2 charging slow, 3 charge complete, 4 error
                    status: chargingStatus >= 1 && chargingStatus <= 3 ? "charging" : "ok",
                };
            }
        }
    }
    else {
        // getBatteryLevelStatus() -> level%, nextLevel%, status
        const resp = await requestBattery(link, deviceIndex, feature.index, 0x00);
        if (resp) {
            const percent = resp[4];
            const status = resp[6];
            if (percent > 0 && percent <= 100) {
                // 0 discharging, 1 recharging, 2 almost full, 3 full, 4 slow recharge
                return {
                    deviceLabel: label,
                    percent,
                    status: status >= 1 && status <= 4 ? "charging" : "ok",
                };
            }
        }
    }
    return {
        deviceLabel: label,
        percent: null,
        status: "not-found",
        detail: "No answer after two tries — powered off or out of range",
    };
}
/**
 * Asks for the battery, giving a sleeping device a second chance.
 *
 * The first request often doubles as the thing that wakes the radio: an idle
 * mouse misses it and answers the next one. Without the retry, a mouse that was
 * simply sitting still read as "powered off or out of range".
 */
async function requestBattery(link, deviceIndex, featureIdx, functionId) {
    for (let attempt = 0; attempt < BATTERY_ATTEMPTS; attempt++) {
        const resp = await link.request(deviceIndex, featureIdx, functionId, [], false, BATTERY_TIMEOUT_MS);
        if (resp)
            return resp;
    }
    return null;
}
/** Feature 0x0005: the device's own product name, read in chunks. */
async function readName(link, deviceIndex, nameIndex) {
    const count = await link.request(deviceIndex, nameIndex, 0x00);
    const length = count?.[4] ?? 0;
    if (!length)
        return null;
    let name = "";
    while (name.length < length && name.length < 64) {
        const before = name.length;
        const chunk = await link.request(deviceIndex, nameIndex, 0x01, [name.length], true);
        if (!chunk)
            break;
        for (let i = 4; i < chunk.length && name.length < length; i++) {
            const code = chunk[i];
            if (code === 0)
                break;
            name += String.fromCharCode(code);
        }
        if (name.length === before)
            break;
    }
    return name.trim() || null;
}
/** Feature 0x0005 getDeviceType. */
async function readDeviceType(link, deviceIndex, nameIndex) {
    const resp = await link.request(deviceIndex, nameIndex, 0x02);
    return resp ? resp[4] : null;
}
/**
 * Feature 0x0003 getDeviceInfo: the 4-byte unit id is unique per physical unit,
 * which makes it the right thing to persist in settings — unlike the HID path,
 * it survives replugging and rebooting.
 */
async function readUnitId(link, deviceIndex) {
    const infoIndex = await featureIndex(link, deviceIndex, FEATURE_DEVICE_INFO);
    if (!infoIndex)
        return null;
    const resp = await link.request(deviceIndex, infoIndex, 0x00, [], true);
    if (!resp || resp.length < 9)
        return null;
    const unit = resp
        .slice(5, 9)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return unit === "00000000" ? null : unit;
}

const VENDOR_RAZER = 0x1532;
/**
 * Razer's control protocol, as documented by OpenRazer
 * (https://github.com/openrazer/openrazer). One 90-byte struct covers every
 * device and every command:
 *
 *   [0]      status          (response only: 0x02 = ok)
 *   [1]      transaction id
 *   [2..3]   remaining packets
 *   [4]      protocol type
 *   [5]      data size
 *   [6]      command class    0x07 is power
 *   [7]      command id       0x80 battery level, 0x84 charging
 *   [8..87]  arguments
 *   [88]     checksum         XOR of [2..87]
 *   [89]     reserved
 *
 * It travels as HID feature report 0x00, so node-hid's buffers carry the report
 * id in front and every struct offset shifts by one.
 */
const REPORT_LENGTH = 90;
const REPORT_ID = 0x00;
const CLASS_POWER = 0x07;
const CMD_BATTERY = 0x80;
const CMD_CHARGING = 0x84;
const STATUS_OK = 0x02;
/**
 * The transaction id is per-device and there's no way to ask for it, so the
 * documented values are tried in turn and the one that answers is remembered.
 * 0x1f covers most wireless mice, 0x3f the keyboards and headsets.
 */
const TRANSACTION_IDS = [0x1f, 0x3f, 0x08, 0x09, 0x00];
/** The device answers its own feature report; it needs a moment to prepare it. */
const REPLY_DELAY_MS = 60;
/** HID usage page 0x01 (Generic Desktop) usages that identify a form factor. */
const USAGE_MOUSE = 0x02;
const USAGE_KEYBOARD = 0x06;
/**
 * Razer peripherals — wireless mice, keyboards and headsets.
 *
 * Nothing is hard-coded per model: any Razer device that answers the power
 * command reports its level, so a Viper, a BlackWidow or a Basilisk all work
 * through the same path, and a model released tomorrow needs no change here.
 *
 * Unverified against hardware — this was written from OpenRazer's protocol
 * rather than from a device on the bench (see scripts/razer-probe.mjs, which
 * prints what a real one answers).
 */
class RazerProvider {
    id = "razer";
    async discover() {
        const devices = await hidDevices(VENDOR_RAZER);
        if (!devices)
            return [];
        // One device exposes several interfaces; only some accept the control
        // protocol, so each product is tried once and its working interface kept.
        const byProduct = new Map();
        for (const info of devices) {
            if (!info.path)
                continue;
            const list = byProduct.get(info.productId) ?? [];
            list.push(info);
            byProduct.set(info.productId, list);
        }
        const found = [];
        for (const [productId, interfaces] of byProduct) {
            const label = (interfaces.find((i) => i.product)?.product ?? "").trim() || `Razer device ${hex4(productId)}`;
            const answer = await this.findChannel(interfaces);
            const device = {
                key: `razer:${hex4(productId)}`,
                providerId: this.id,
                label,
                kind: kindOf$1(interfaces, label),
                supportsBattery: answer !== undefined,
                locator: { productId, transactionId: answer?.transactionId ?? -1 },
            };
            device.reading = answer
                ? answer.reading
                : // Silent rather than batteryless — the device may simply be asleep,
                    // so this reads as absent and lets the poll back off.
                    notFound(label, "Detected, but it didn't answer the Razer power command");
            found.push(device);
        }
        return found;
    }
    async read(device) {
        const productId = Number(device.locator.productId);
        const devices = await hidDevices(VENDOR_RAZER);
        const interfaces = devices?.filter((d) => d.path && d.productId === productId) ?? [];
        if (interfaces.length === 0) {
            return { deviceLabel: device.label, percent: null, status: "not-found", detail: "Device not connected" };
        }
        // The transaction id found during discovery saves re-testing all of them.
        const known = Number(device.locator.transactionId);
        const answer = await this.findChannel(interfaces, known >= 0 ? [known] : undefined);
        return answer?.reading ?? notFound(device.label, "Device didn't answer the Razer power command");
    }
    /** Finds an interface and transaction id that answer, and reads the battery. */
    async findChannel(interfaces, transactionIds = TRANSACTION_IDS) {
        const label = (interfaces.find((i) => i.product)?.product ?? "Razer device").trim();
        for (const info of interfaces) {
            for (const transactionId of transactionIds) {
                const level = await this.exchange(info, transactionId, CMD_BATTERY);
                if (level === undefined)
                    continue;
                // A sleeping device answers 0; that's "no reading", not "flat".
                const percent = clampPercent((level / 255) * 100);
                if (percent <= 0)
                    continue;
                const charging = await this.exchange(info, transactionId, CMD_CHARGING);
                return {
                    transactionId,
                    reading: {
                        deviceLabel: label,
                        percent,
                        status: charging ? "charging" : "ok",
                    },
                };
            }
        }
        return undefined;
    }
    /** Sends one power command and returns the byte the device answers with. */
    async exchange(info, transactionId, commandId) {
        // undefined on a failure to open: the wrong interface for this protocol,
        // or a device busy elsewhere, which is what the probe loop expects.
        return withHidDevice(info.path, undefined, async (device) => {
            device.sendFeatureReport([REPORT_ID, ...buildReport(transactionId, commandId)]);
            await sleep(REPLY_DELAY_MS);
            const reply = device.getFeatureReport(REPORT_ID, REPORT_LENGTH + 1);
            if (!reply?.length)
                return undefined;
            // Offsets shift by one: node-hid puts the report id in front.
            const status = reply[1];
            const commandClass = reply[7];
            const answeredId = reply[8];
            if (status !== STATUS_OK || commandClass !== CLASS_POWER || answeredId !== commandId)
                return undefined;
            return reply[10];
        });
    }
}
function buildReport(transactionId, commandId) {
    const report = new Array(REPORT_LENGTH).fill(0);
    report[1] = transactionId;
    report[5] = 0x02; // data size
    report[6] = CLASS_POWER;
    report[7] = commandId;
    let crc = 0;
    for (let i = 2; i < 88; i++)
        crc ^= report[i];
    report[88] = crc;
    return report;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function kindOf$1(interfaces, label) {
    for (const info of interfaces) {
        if (info.usagePage !== 0x01)
            continue;
        if (info.usage === USAGE_MOUSE)
            return "mouse";
        if (info.usage === USAGE_KEYBOARD)
            return "keyboard";
    }
    const name = label.toLowerCase();
    if (/kraken|barracuda|nari|thresher|blackshark|headset/.test(name))
        return "headset";
    if (/hammerhead|earbud/.test(name))
        return "earbuds";
    if (/basilisk|deathadder|viper|naga|orochi|lancehead|mamba|pro click|mouse/.test(name))
        return "mouse";
    if (/blackwidow|huntsman|ornata|cynosa|deathstalker|keyboard/.test(name))
        return "keyboard";
    if (/seiren|microphone/.test(name))
        return "microphone";
    if (/leviathan|nommo|speaker/.test(name))
        return "speaker";
    if (/wolverine|raiju|kishi|controller/.test(name))
        return "gamepad";
    if (/tartarus|orbweaver|nostromo/.test(name))
        return "keyboard";
    log.info(`razer: no form factor matched for "${label}"`);
    return "other";
}

const execFileAsync$1 = node_util.promisify(node_child_process.execFile);
const TIMEOUT_MS$1 = 20000;
/**
 * DEVPKEY_Bluetooth_Battery. Windows mirrors the GATT Battery Service level of a
 * connected Bluetooth LE device into this PnP device property, which is how the
 * Settings app shows peripheral battery percentages.
 */
const BATTERY_PROPERTY = "{104EA319-6EE2-4701-BD47-8DDBF425BBE5} 2";
/**
 * Two things here are performance-critical, because this runs while the property
 * inspector waits on the device list:
 *
 *  - Only the top-level `BTHENUM\DEV_*` / `BTHLE\DEV_*` nodes can carry the
 *    battery property. The Bluetooth class also contains a service node per
 *    profile per device (49 nodes vs 8 real devices on the dev machine), and
 *    each property read is a separate CIM round-trip at ~0.7s.
 *  - Piping into Get-PnpDeviceProperty is far cheaper than calling it per
 *    device in a loop.
 *
 * Together those take the scan from ~34s to ~2s.
 */
const SCRIPT$1 = [
    "$ErrorActionPreference='SilentlyContinue';",
    `$key='${BATTERY_PROPERTY}';`,
    "$devices = Get-PnpDevice -Class Bluetooth -PresentOnly |",
    "  Where-Object { $_.InstanceId -like 'BTHLE\\DEV_*' -or $_.InstanceId -like 'BTHENUM\\DEV_*' };",
    "$names = @{};",
    "foreach ($d in $devices) { $names[$d.InstanceId] = $d.FriendlyName }",
    // Devices without the property are kept, with a null level: they're still
    // real paired peripherals worth listing, they just can't report a level.
    "$out = $devices | Get-PnpDeviceProperty -KeyName $key |",
    "  ForEach-Object { [pscustomobject]@{",
    "    id=$_.InstanceId; name=$names[$_.InstanceId];",
    "    level=$(if ($_.Data -ne $null) { [int]$_.Data } else { $null }) } };",
    "ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");
/**
 * How long one PowerShell result is reused.
 *
 * Deliberately short. A single key press already asks twice — the rescan behind
 * `discovery.list(force)` and then the direct `read()` for that one device — and
 * this collapses that pair into one process without letting a later poll be
 * served anything a user would notice as stale.
 */
const QUERY_TTL_MS = 2000;
/**
 * Detects Bluetooth peripherals that report battery to Windows itself. This is
 * the only vendor-independent source of battery levels on the machine, so it
 * picks up keyboards, mice and controllers no dedicated provider knows about —
 * as long as they're paired over Bluetooth rather than a proprietary 2.4 GHz
 * dongle (dongle-connected devices are invisible to the OS battery property).
 */
class WindowsBluetoothProvider {
    id = "winbt";
    /**
     * The PnP property is a bare percentage. Windows keeps a Boolean next to it
     * ({104EA319-…} 3) that looks like it should be a charging flag, but it stays
     * False on a phone whose level is visibly climbing, so it isn't one.
     */
    reportsCharging = false;
    async discover() {
        const entries = await this.query();
        return entries.map((entry) => ({
            key: `winbt:${slug(entry.id)}`,
            providerId: this.id,
            label: entry.name.trim() || "Bluetooth device",
            kind: kindOf(entry.name),
            supportsBattery: entry.level !== null,
            locator: { instanceId: entry.id },
            reading: toReading(entry),
        }));
    }
    async read(device) {
        if (process.platform !== "win32") {
            return { deviceLabel: device.label, percent: null, status: "unsupported", detail: "Windows only" };
        }
        const entries = await this.query();
        const match = entries.find((e) => `winbt:${slug(e.id)}` === device.key);
        if (!match) {
            return {
                deviceLabel: device.label,
                percent: null,
                status: "not-found",
                detail: "Bluetooth device disconnected",
            };
        }
        return toReading(match);
    }
    /**
     * One PowerShell run serves every key. The script already enumerates all
     * paired devices, so asking once per key only multiplied the process count.
     */
    query = coalesce(() => this.runScript(), QUERY_TTL_MS);
    async runScript() {
        if (process.platform !== "win32")
            return [];
        try {
            const { stdout } = await execFileAsync$1("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT$1], { timeout: TIMEOUT_MS$1, windowsHide: true });
            const parsed = JSON.parse(stdout.trim() || "[]");
            const list = Array.isArray(parsed) ? parsed : [parsed];
            // Everything downstream trusts these three fields, so they're pinned to
            // their types here rather than checked again at each use. A missing
            // property comes back as JSON null, and Number(null) is 0 — which would
            // report a healthy device as flat. Only a real number counts.
            return list
                .filter((e) => !!e && typeof e === "object")
                .filter((e) => typeof e.id === "string")
                .map((e) => ({
                id: e.id,
                name: typeof e.name === "string" ? e.name : "",
                level: typeof e.level === "number" && Number.isFinite(e.level) ? e.level : null,
            }));
        }
        catch (err) {
            // PowerShell missing/blocked, or no Bluetooth stack — just contribute
            // nothing. Logged because an empty list is otherwise indistinguishable
            // from a machine that genuinely has no paired devices.
            log.warn(`windows-bluetooth: could not read paired devices: ${String(err)}`);
            return [];
        }
    }
}
function toReading(entry) {
    const label = entry.name.trim() || "Bluetooth device";
    // Only Bluetooth LE devices that implement the GATT battery service get the
    // property. A Classic device without it may well have a battery Windows can't
    // see (AirPods report theirs over Apple's own protocol), so this says
    // "unreadable", not "mains" — the key's power-source setting is how you tell
    // it the thing is permanently plugged in.
    if (entry.level === null) {
        return {
            deviceLabel: label,
            percent: null,
            status: "unsupported",
            detail: "Paired, but Windows has no battery level for it",
        };
    }
    const percent = clampPercent(entry.level);
    // Windows exposes the GATT level only; there is no charging flag in this property.
    return { deviceLabel: label, percent, status: "ok" };
}
/**
 * Best guess at a form factor from the name Windows shows. A Bluetooth device
 * does advertise a class-of-device code, but the PnP property that carries it
 * isn't exposed here, and the name is what the user recognises anyway.
 */
function kindOf(name) {
    const value = name.toLowerCase();
    if (/keyboard|keychron|azoth|kbd/.test(value))
        return "keyboard";
    if (/mouse|mx |trackball/.test(value))
        return "mouse";
    if (/buds|earbud|airpods|pods\b|freebuds/.test(value))
        return "earbuds";
    if (/headset|headphone|arctis|cloud|wh-|beats|bose|jbl tune/.test(value))
        return "headset";
    if (/controller|gamepad|dualsense|dualshock|xbox|joy-con/.test(value))
        return "gamepad";
    if (/watch|band\b|fitbit|garmin/.test(value))
        return "watch";
    if (/ipad|tab\b|tablet/.test(value))
        return "tablet";
    if (/iphone|phone|pixel|galaxy s|oneplus|xperia/.test(value))
        return "phone";
    if (/speaker|nest|echo|sonos|soundbar|homepod|boom|flip\b/.test(value))
        return "speaker";
    if (/mic\b|microphone|solocast|quadcast|yeti|podcast|wave:/.test(value))
        return "microphone";
    return "other";
}

/**
 * Every provider is asked to enumerate what it can see; nothing is registered
 * per-model. Adding support for a new device family means adding a provider
 * here, not adding an entry to a device list.
 */
const providers = [
    new HeadsetControlProvider(),
    new LogitechProvider(),
    new AsusProvider(),
    new RazerProvider(),
    new DualSenseProvider(),
    new XboxProvider(),
    new WindowsBluetoothProvider(),
    // Last: its entries are dropped wherever a real provider covers the same
    // hardware (see mergeGeneric).
    new GenericHidProvider(),
];
const providersById = new Map(providers.map((p) => [p.id, p]));
/** A scan opens HID interfaces and shells out, so results are reused briefly. */
const CACHE_TTL_MS$1 = 10_000;
/** Desk peripherals first, then things that merely happen to be paired. */
const KIND_ORDER = {
    headset: 0,
    earbuds: 1,
    mouse: 2,
    keyboard: 3,
    gamepad: 4,
    microphone: 5,
    speaker: 6,
    phone: 7,
    tablet: 8,
    watch: 9,
    other: 10,
};
class DeviceDiscovery {
    cache;
    inflight;
    /** Lists everything detected on this machine, right now. */
    async list(force = false) {
        if (force)
            this.invalidate();
        if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS$1) {
            return this.cache.devices;
        }
        // Serialize: concurrent scans would fight over exclusive HID handles.
        this.inflight ??= this.scan().finally(() => {
            this.inflight = undefined;
        });
        return this.inflight;
    }
    async find(key, force = false) {
        return (await this.list(force)).find((d) => d.key === key);
    }
    invalidate() {
        this.cache = undefined;
    }
    provider(id) {
        return providersById.get(id);
    }
    async scan() {
        const started = Date.now();
        const results = await Promise.allSettled(providers.map((p) => p.discover()));
        const found = [];
        results.forEach((result, i) => {
            if (result.status === "fulfilled")
                found.push(...result.value);
            else
                log.warn(`discovery: provider ${providers[i].id} failed`, result.reason);
        });
        const devices = mergeGeneric(found);
        // Devices that can actually report a level come first: the picker defaults
        // to the top entry, and the catch-all list is long.
        devices.sort((a, b) => Number(b.supportsBattery) - Number(a.supportsBattery) ||
            KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
            a.label.localeCompare(b.label));
        log.info(`discovery: found ${devices.length} device(s) in ${Date.now() - started}ms`);
        this.cache = { at: Date.now(), devices };
        return devices;
    }
}
const discovery = new DeviceDiscovery();
/**
 * Drops entries for hardware another provider described better.
 *
 * One device can legitimately reach two providers: a DualSense is both a Sony
 * HID device and a paired Bluetooth node, and a HyperX headset is both a
 * HeadsetControl device and a plain HID interface. Only one of those knows how
 * to read its battery, and the picker shouldn't offer the other.
 *
 * Names are what's available to match on — they all come from the device's own
 * product string — so they're compared loosely: the HID layer prefixes the
 * manufacturer ("HP, Inc HyperX Cloud Alpha Wireless") where HeadsetControl
 * doesn't. A false match only costs a duplicate entry that said less than the
 * one it was dropped for.
 */
function mergeGeneric(devices) {
    const readable = devices.filter((d) => d.supportsBattery).map((d) => normalize(d.label));
    return devices.filter((device) => {
        if (device.supportsBattery)
            return true;
        // Fallback entries lose to anything; a provider-specific entry only loses
        // to one that can actually report a level.
        const name = normalize(device.label);
        return !readable.some((other) => sameDevice(name, other));
    });
}
/**
 * Loose name match, but only loose enough to survive a manufacturer prefix.
 * Substring matching on a short name would collide with anything ("4" is a real
 * Bluetooth friendly name on the dev machine), so that falls back to equality.
 */
const MIN_SUBSTRING_MATCH = 6;
function sameDevice(a, b) {
    if (a === b)
        return true;
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    return shorter.length >= MIN_SUBSTRING_MATCH && longer.includes(shorter);
}
function normalize(label) {
    return label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

const DEFAULT_COLORS = {
    low: "#e35d5d",
    medium: "#e3b34d",
    high: "#2ecc71",
    charging: "#55ff7f",
    background: "#000000",
    foreground: "#eaeaea",
};
/**
 * Charging colours this plugin has shipped as the default, oldest first: blue,
 * then a muted green. Kept so a key still sitting on one of them can be moved to
 * the current default, while a colour the user picked is left alone.
 */
const LEGACY_CHARGING_COLORS = ["#3ba7ff", "#3ddc84"];
/** Backgrounds this plugin has shipped as the default, oldest first. */
const LEGACY_BACKGROUND_COLORS = ["#1e2024"];
const MUTED = "#5a5f66";
/** How far a last-known ("stale") face is faded relative to a live one. */
const STALE_OPACITY = 0.45;
const SIZE = 72;
/** Breathing room between the icon, the meter, the number and the name line. */
const GAP = 6;
const FONT = "Segoe UI, Helvetica, Arial, sans-serif";
/**
 * Rough advance width of a bold Segoe UI digit as a fraction of font size. SVG
 * offers no text metrics, and text that overflows its slot is unreadable rather
 * than merely untidy, so sizes are derived from this estimate.
 */
const CHAR_WIDTH_RATIO = 0.62;
/**
 * Ring geometry. The ring is a gauge around the edge of the key rather than one
 * item in the stack: at 72px there's no way to stack an icon, a ring, a
 * percentage and a name and leave the number legible, but there is room for all
 * of them *inside* a border ring.
 */
const RING_SIZE = 62;
const RING_STROKE = 5;
/** Usable width inside the ring; it's a circle, so don't span the full diameter. */
const RING_INNER_WIDTH = (RING_SIZE - RING_STROKE * 2) * 0.78;
/** Usable width for the other styles, inset from the key edge. */
const FLAT_INNER_WIDTH = 62;
/**
 * Every glyph is drawn on the same 24×24 grid with the same stroke weight, then
 * scaled into whatever slot the layout gives it. Sharing one grid is what makes
 * a keyboard and a phone look like members of one set rather than clip art from
 * different places, and it keeps their optical sizes in step.
 */
const ICON_GRID = 24;
const ICON_STROKE = 2.1;
function fitFontSize(text, maxWidth, maxFont) {
    const byWidth = maxWidth / (CHAR_WIDTH_RATIO * Math.max(1, text.length));
    return Math.max(MIN_FONT_SIZE, Math.min(maxFont, byWidth));
}
function truncateToWidth(text, maxWidth, fontSize) {
    const maxChars = Math.max(3, Math.floor(maxWidth / (CHAR_WIDTH_RATIO * fontSize)));
    return text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text;
}
function meterColor(percent, status, options) {
    if (status === "mains")
        return options.colors.foreground;
    if (status === "unsupported" || status === "not-found" || status === "error")
        return MUTED;
    if (status === "charging")
        return options.colors.charging;
    if (percent === null)
        return MUTED;
    // "stale" keeps the threshold colour so the level still reads at a glance; it's
    // the dimming and the offline glyph that say the number isn't live.
    if (percent <= options.lowThreshold)
        return options.colors.low;
    if (percent <= options.mediumThreshold)
        return options.colors.medium;
    return options.colors.high;
}
/** Short caption to show when there's no numeric percentage. */
function fallbackLabel(status) {
    if (status === "unsupported")
        return "N/A";
    if (status === "error")
        return "ERR";
    return "—"; // not-found / offline
}
/**
 * Mains plug, drawn in place of the meter and the percentage for a device that
 * runs off the cable. A power symbol would read as "on/off"; a plug says where
 * the energy comes from, which is the actual answer.
 */
const PLUG_HEIGHT = 26;
function plugGlyph(y, color) {
    const cx = SIZE / 2;
    return `<g transform="translate(${cx} ${(y + PLUG_HEIGHT / 2).toFixed(2)})" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
		<path d="M-7 -13 v6"/>
		<path d="M7 -13 v6"/>
		<path d="M-11 -7 h22 v4 a11 11 0 0 1 -22 0 z"/>
		<path d="M0 4 v9"/>
	</g>`;
}
/** Greedy wrap: fills each line with as many whole words as fit. */
function wrapWords(words, maxChars) {
    const lines = [];
    for (const word of words) {
        const current = lines[lines.length - 1];
        if (current !== undefined && current.length + 1 + word.length <= maxChars) {
            lines[lines.length - 1] = `${current} ${word}`;
        }
        else {
            lines.push(word);
        }
    }
    return lines;
}
/** Smallest readable size on a 72px key; below this, text is decoration. */
const MIN_FONT_SIZE = 8;
/**
 * Wraps a key's contents in the SVG shell and hands back what setImage wants.
 *
 * A bare `<svg>` string is silently ignored by Stream Deck and the key keeps
 * its manifest image, so the data URI isn't optional — which is exactly why
 * every entry point went through the same three lines before this existed.
 */
function keyImage(background, body) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
		<rect width="${SIZE}" height="${SIZE}" fill="${background}"/>
		${body}
	</svg>`;
    return `data:image/svg+xml;charset=utf8,${encodeURIComponent(svg)}`;
}
function escapeXml(value) {
    return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
/**
 * Line art for the device's form factor, drawn on the shared 24×24 grid.
 *
 * Each glyph is stroked rather than filled, at one weight, with round caps and
 * joins — small solid shapes are reserved for the details that need to read at
 * ~20px (keycaps, buttons), where a stroked outline would fill in. Everything is
 * built from the silhouette a person would recognise across a desk: a phone is
 * its screen, a mic is its capsule and arc, a speaker is its driver.
 */
function deviceGlyph(kind, color) {
    const stroke = `fill="none" stroke="${color}" stroke-width="${ICON_STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
    switch (kind) {
        case "headset":
            return `
			<path d="M3.2 15.5 V12 a8.8 8.8 0 0 1 17.6 0 v3.5" ${stroke}/>
			<rect x="1.4" y="13.4" width="5" height="8.4" rx="2.5" ${stroke}/>
			<rect x="17.6" y="13.4" width="5" height="8.4" rx="2.5" ${stroke}/>
			<path d="M18 21.6 q-1.4 2.6 -4.4 2.6" ${stroke}/>
			<circle cx="12.6" cy="24.2" r="1.1" fill="${color}"/>`;
        case "earbuds":
            return `
			<path d="M7.2 3.4 a4.3 4.3 0 0 1 4.3 4.3 v3.6 a4.3 4.3 0 0 1 -8.6 0 V7.7 a4.3 4.3 0 0 1 4.3 -4.3 z" ${stroke}/>
			<path d="M7.2 15.6 V20" ${stroke}/>
			<path d="M16.8 3.4 a4.3 4.3 0 0 1 4.3 4.3 v3.6 a4.3 4.3 0 0 1 -8.6 0 V7.7 a4.3 4.3 0 0 1 4.3 -4.3 z" ${stroke}/>
			<path d="M16.8 15.6 V20" ${stroke}/>`;
        case "mouse":
            return `
			<rect x="6.6" y="1.6" width="10.8" height="20.8" rx="5.4" ${stroke}/>
			<path d="M12 5.4 V9.6" ${stroke}/>`;
        case "keyboard":
            return `
			<rect x="1.3" y="5.4" width="21.4" height="13.2" rx="2.6" ${stroke}/>
			<rect x="4.8" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="9.1" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="13.4" y="9" width="2.6" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="17.7" y="9" width="1.9" height="1.9" rx="0.9" fill="${color}"/>
			<rect x="7.4" y="13.4" width="9.2" height="1.9" rx="0.9" fill="${color}"/>`;
        case "gamepad":
            return `
			<path d="M8.4 7.6 h7.2 a6.6 6.6 0 0 1 6.4 8.2 l-0.9 3.6 a2.9 2.9 0 0 1 -5.3 0.8 L14.2 17 H9.8 l-1.6 3.2 a2.9 2.9 0 0 1 -5.3 -0.8 l-0.9 -3.6 A6.6 6.6 0 0 1 8.4 7.6 z" ${stroke}/>
			<path d="M7.2 11.4 v3.2 M5.6 13 h3.2" ${stroke}/>
			<circle cx="16.2" cy="11.8" r="1.2" fill="${color}"/>
			<circle cx="18.6" cy="14.2" r="1.2" fill="${color}"/>`;
        case "phone":
            // The notch is what makes this read as a phone rather than a remote or
            // a battery, and being filled it survives the downscale to ~20px where
            // the hairline earpiece and home indicator it replaces turned to mush.
            return `
			<rect x="6.2" y="1.7" width="11.6" height="20.6" rx="3.6" ${stroke}/>
			<rect x="9.4" y="1.7" width="5.2" height="2" rx="1" fill="${color}"/>`;
        case "tablet":
            return `
			<rect x="3.4" y="2.4" width="17.2" height="19.2" rx="2.6" ${stroke}/>
			<path d="M9.9 18.6 h4.2" ${stroke}/>`;
        case "speaker":
            return `
			<rect x="5.4" y="2.2" width="13.2" height="19.6" rx="3.2" ${stroke}/>
			<circle cx="12" cy="14.6" r="3.6" ${stroke}/>
			<circle cx="12" cy="7" r="1.15" fill="${color}"/>`;
        case "microphone":
            return `
			<rect x="8.9" y="1.5" width="6.2" height="12.2" rx="3.1" ${stroke}/>
			<path d="M5.6 12.2 a6.4 6.4 0 0 0 12.8 0" ${stroke}/>
			<path d="M12 18.6 V22" ${stroke}/>
			<path d="M8.4 22.4 h7.2" ${stroke}/>`;
        case "watch":
            return `
			<rect x="6.2" y="6.2" width="11.6" height="11.6" rx="3.4" ${stroke}/>
			<path d="M9.2 6.2 V2.6 h5.6 v3.6" ${stroke}/>
			<path d="M9.2 17.8 v3.6 h5.6 v-3.6" ${stroke}/>`;
        case "other":
            return `
			<rect x="3.6" y="3.6" width="16.8" height="16.8" rx="4.4" ${stroke}/>
			<circle cx="12" cy="12" r="3.4" ${stroke}/>`;
    }
}
/**
 * Marks the "lowest of several" face: a chevron pointing at the bottom of the
 * pile, in the top left where this plugin keeps its corner markers — the same
 * spot as the charging bolt and the offline glyph.
 *
 * That shared corner is why it yields to the bolt while charging: one marker at
 * a time keeps the corner readable, and a charging device is on its way out of
 * being the problem anyway. The frame still marks a genuinely low one.
 */
function lowestGlyph(color, background, opacity) {
    // A filled disc first: the chevron sits over the meter, and a bare stroke on
    // top of a coloured bar is hard to pick out. The disc is the key's own
    // background, so it reads as a hole punched in the face rather than a sticker.
    // Tucked into the corner: in "percentage only" style the number runs wide
    // enough that a disc centred any lower would cover the first digit.
    return `<circle cx="11" cy="11" r="10.2" fill="${background}" fill-opacity="${opacity}"/>
	<g fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
		<path d="M11 6 v9.4"/>
		<path d="M6.8 11.4 L11 15.8 L15.2 11.4"/>
	</g>`;
}
/**
 * Corner marker for a last-known reading: a struck-through circle, in the top
 * left where nothing else in the stack is drawn (the charging bolt owns the top
 * right). Kept at full opacity while the face behind it is faded, so "this is
 * not live" stays legible.
 */
function offlineGlyph(color, background) {
    // Same disc as the "lowest" chevron: both are corner markers sitting over the
    // meter, and both need separating from it to be read at a glance.
    return `<circle cx="11" cy="11" r="10.2" fill="${background}"/>
	<g fill="none" stroke="${color}" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round">
		<circle cx="11" cy="11" r="5.5"/>
		<line x1="7.1" y1="14.9" x2="14.9" y2="7.1"/>
	</g>`;
}
/** Horizontal battery outline with a proportional fill. */
function barMeter(y, height, percent, color, options, opacity) {
    const x = 13;
    const width = 42;
    const pad = 3;
    const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
    const fillWidth = ((width - pad * 2) * clamped) / 100;
    const fill = percent !== null
        ? `<rect x="${x + pad}" y="${y + pad}" width="${fillWidth.toFixed(2)}" height="${height - pad * 2}" rx="2" fill="${color}" fill-opacity="${opacity}"/>`
        : `<line x1="${x + 12}" y1="${y + 5}" x2="${x + width - 12}" y2="${y + height - 5}" stroke="${color}" stroke-width="3"/>`;
    return `
		<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="4" fill="none" stroke="${options.colors.foreground}" stroke-width="3"/>
		<rect x="${x + width}" y="${y + height * 0.3}" width="4" height="${height * 0.4}" rx="1" fill="${options.colors.foreground}"/>
		${fill}`;
}
/** Donut arc drawn around the edge of the key, behind the stacked content. */
function ringMeter(percent, color, options, opacity) {
    const radius = RING_SIZE / 2 - RING_STROKE / 2;
    const c = SIZE / 2;
    const circumference = 2 * Math.PI * radius;
    const clamped = percent === null ? 0 : Math.max(0, Math.min(100, percent));
    const arc = (circumference * clamped) / 100;
    const track = `<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${options.colors.foreground}" stroke-opacity="0.22" stroke-width="${RING_STROKE}"/>`;
    if (percent === null)
        return track;
    return `${track}<circle cx="${c}" cy="${c}" r="${radius}" fill="none" stroke="${color}" stroke-opacity="${opacity}" stroke-width="${RING_STROKE}" stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${(circumference - arc).toFixed(2)}" transform="rotate(-90 ${c} ${c})"/>`;
}
/**
 * A short message on the key, for something the user needs told right now — a
 * press on a device that isn't there. Stream Deck has no toast or tooltip a
 * plugin can raise, so the key itself has to carry the words; the caller puts
 * the normal face back afterwards.
 *
 * The text is sized so its longest word fits the key, then wrapped greedily at
 * that size — at 72px that's a dozen characters a line.
 */
function noticeKeyImage(message, colors) {
    const words = message.split(/\s+/).filter(Boolean);
    const longest = words.reduce((max, word) => Math.max(max, word.length), 1);
    const fontSize = Math.max(MIN_FONT_SIZE, Math.min(13, FLAT_INNER_WIDTH / (CHAR_WIDTH_RATIO * longest)));
    const lines = wrapWords(words, Math.floor(FLAT_INNER_WIDTH / (CHAR_WIDTH_RATIO * fontSize)));
    const lineHeight = fontSize * 1.25;
    const triangle = 15;
    const gap = 5;
    const total = triangle + gap + lines.length * lineHeight;
    let cursor = (SIZE - total) / 2;
    const warning = `<g transform="translate(${SIZE / 2} ${(cursor + triangle / 2).toFixed(2)})">
		<path d="M0 -8 L9 8 H-9 Z" fill="none" stroke="${colors.medium}" stroke-width="2.5" stroke-linejoin="round"/>
		<line x1="0" y1="-3" x2="0" y2="3" stroke="${colors.medium}" stroke-width="2.5" stroke-linecap="round"/>
		<circle cx="0" cy="6" r="1.2" fill="${colors.medium}"/>
	</g>`;
    cursor += triangle + gap;
    const text = lines
        .map((line, i) => {
        const y = cursor + (i + 1) * lineHeight - lineHeight * 0.3;
        return `<text x="${SIZE / 2}" y="${y.toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize.toFixed(1)}" font-weight="600" fill="${colors.foreground}">${escapeXml(line)}</text>`;
    })
        .join("");
    return keyImage(colors.background, `${warning}${text}`);
}
/**
 * Face for the renaming key: a luggage-tag glyph over "renamed / detected".
 *
 * It shows counts rather than a device because it isn't about one device — the
 * useful thing at a glance is whether any names are in force at all.
 */
function renameKeyImage(renamed, detected, colors) {
    const accent = renamed > 0 ? colors.high : colors.foreground;
    const body = `<g transform="translate(24 12) scale(1)" fill="none" stroke="${accent}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
			<path d="M11.4 1.6 H21 a1.4 1.4 0 0 1 1.4 1.4 v9.6 a1.4 1.4 0 0 1 -0.4 1 l-8.6 8.6 a1.4 1.4 0 0 1 -2 0 L2.4 13.6 a1.4 1.4 0 0 1 0 -2 l8.6 -8.6 a1.4 1.4 0 0 1 0.4 -1.4 z"/>
			<circle cx="17.4" cy="6.6" r="1.6"/>
		</g>
		<text x="${SIZE / 2}" y="52" text-anchor="middle" font-family="${FONT}" font-size="15" font-weight="700" fill="${accent}">${renamed}</text>
		<text x="${SIZE / 2}" y="65" text-anchor="middle" font-family="${FONT}" font-size="10" fill="${colors.foreground}" fill-opacity="0.75">of ${detected}</text>`;
    return keyImage(colors.background, body);
}
/**
 * Renders the key face as an SVG data URI, which is what setImage expects — a
 * bare <svg> string is silently ignored by Stream Deck and the key keeps its
 * manifest image.
 *
 * Elements stack vertically and are centred as a group, so turning the icon or
 * the name off re-balances the rest instead of leaving a hole. In ring style the
 * ring sits around the edge and the stack renders inside it.
 */
function batteryKeyImage(options) {
    const { percent, status, style, colors } = options;
    const color = meterColor(percent, status, options);
    const label = percent === null ? fallbackLabel(status) : `${percent}%`;
    const isRing = style === "ring";
    const gap = isRing ? 4 : GAP;
    const innerWidth = isRing ? RING_INNER_WIDTH : FLAT_INNER_WIDTH;
    // A small, slow opacity swing reads as "active" without flickering.
    const opacity = status === "charging" ? 0.78 + 0.22 * (options.pulse ?? 1) : 1;
    const blocks = [];
    if (options.showIcon) {
        const height = isRing ? 17 : 21;
        const scale = height / ICON_GRID;
        blocks.push({
            height,
            render: (y) => `<g transform="translate(${((SIZE - ICON_GRID * scale) / 2).toFixed(2)} ${y.toFixed(2)}) scale(${scale.toFixed(3)})">${deviceGlyph(options.kind, colors.foreground)}</g>`,
        });
    }
    // A mains device has no level to draw, so the plug takes the place of both the
    // meter and the percentage rather than sitting alongside an empty one.
    const isMains = status === "mains";
    if (isMains) {
        blocks.push({ height: PLUG_HEIGHT, render: (y) => plugGlyph(y, color) });
    }
    if (style === "bar" && !isMains) {
        const height = 16;
        blocks.push({ height, render: (y) => barMeter(y, height, percent, color, options, opacity) });
    }
    if (options.showPercent && !isMains) {
        // Size from the worst case ("100%") rather than the current value, so the
        // layout doesn't jump when the reading crosses 100 or drops to a dash.
        const maxFont = style === "text" ? 30 : 18;
        const fontSize = fitFontSize("100%", innerWidth, maxFont);
        const height = fontSize;
        blocks.push({
            height,
            render: (y) => `<text x="${SIZE / 2}" y="${(y + height * 0.82).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize.toFixed(1)}" font-weight="700" fill="${color}" fill-opacity="${opacity}">${label}</text>`,
        });
    }
    if (options.showName) {
        const fontSize = isRing ? 9 : 10;
        const height = fontSize;
        const short = escapeXml(truncateToWidth(options.name, innerWidth, fontSize));
        blocks.push({
            height,
            render: (y) => `<text x="${SIZE / 2}" y="${(y + height * 0.85).toFixed(2)}" text-anchor="middle" font-family="${FONT}" font-size="${fontSize}" fill="${colors.foreground}" fill-opacity="0.8">${short}</text>`,
        });
    }
    const scaledStack = layoutStack(blocks, isRing, gap);
    const ring = isRing ? ringMeter(percent, color, options, opacity) : "";
    // A last-known reading is faded as a whole — outline and icon included — so it
    // can't be mistaken for a live one, and marked with a "disconnected" glyph.
    const face = status === "stale"
        ? `<g opacity="${STALE_OPACITY}">${ring}${scaledStack}</g>${offlineGlyph(colors.foreground, colors.background)}`
        : `${ring}${scaledStack}`;
    // A frame in the meter's colour turns the whole key into the warning when the
    // lowest device is actually low, rather than leaving a small number to be
    // noticed among five healthy keys.
    const frame = options.lowest && percent !== null && percent <= options.lowThreshold
        ? `<rect x="1.5" y="1.5" width="${SIZE - 3}" height="${SIZE - 3}" rx="7" fill="none" stroke="${color}" stroke-width="3"/>`
        : "";
    const lowestMark = options.lowest && status !== "not-found" && status !== "charging"
        ? lowestGlyph(color, colors.background, opacity)
        : "";
    // The bolt marks charging even when the colour is close to the "high" colour.
    // Top left, the same corner the offline glyph uses — a device can't be both
    // charging and gone, so they never collide.
    const bolt = status === "charging"
        ? `<path d="M12 6 l-7 12 h5 l-4 10 11 -14 h-5 z" fill="${colors.charging}" fill-opacity="${opacity}" stroke="${colors.background}" stroke-width="1"/>`
        : "";
    return keyImage(colors.background, `${face}${frame}${lowestMark}${bolt}`);
}
/**
 * Stacks the blocks vertically, centred as a group, and shrinks the result if it
 * doesn't fit.
 *
 * Enabling everything can ask for more height than the key has (and in ring
 * style, more than the ring's inner circle). Gaps close first, then the whole
 * stack scales down uniformly, so a crowded key degrades in proportion rather
 * than spilling over the edge.
 */
function layoutStack(blocks, isRing, gap) {
    // of text near the top or bottom of a circle has far less width than one
    // across its middle, so the stack is kept to the band where it fits.
    const available = isRing ? (RING_SIZE - RING_STROKE * 2) * 0.8 : SIZE - 4;
    const content = blocks.reduce((sum, b) => sum + b.height, 0);
    const gaps = Math.max(0, blocks.length - 1);
    let spacing = gap;
    if (content + spacing * gaps > available && gaps > 0) {
        spacing = Math.max(1, (available - content) / gaps);
    }
    const total = content + spacing * gaps;
    const scale = total > available ? available / total : 1;
    let cursor = (SIZE - total) / 2;
    const stack = blocks
        .map((block) => {
        const rendered = block.render(cursor);
        cursor += block.height + spacing;
        return rendered;
    })
        .join("");
    const scaledStack = scale === 1
        ? stack
        : `<g transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${scale.toFixed(3)}) translate(${-SIZE / 2} ${-SIZE / 2})">${stack}</g>`;
    return scaledStack;
}

/** The look every key adopts, or undefined when nobody has shared one yet. */
async function sharedAppearance() {
    const global = await streamDeck.settings.getGlobalSettings();
    return global?.appearance;
}
/** Publishes a look; the global-settings event is what spreads it to the keys. */
async function shareAppearance(appearance) {
    await streamDeck.settings.setGlobalSettings({ appearance });
}
/**
 * Writes an appearance into every visible key of one action.
 *
 * Propagation goes through the global-settings event rather than the button
 * pushing directly, so both action types hear it the same way and there's one
 * path to reason about. Writing values a key already has is harmless: it
 * repaints from the cached reading and touches no device.
 */
async function applyAppearance(actions, appearance) {
    for (const action of actions) {
        const current = await action.getSettings();
        await action.setSettings({ ...current, ...appearance });
    }
}

const execFileAsync = node_util.promisify(node_child_process.execFile);
const TIMEOUT_MS = 20_000;
/** The installed-apps list changes rarely, and enumerating it costs ~1s. */
const CACHE_TTL_MS = 5 * 60_000;
/**
 * Lists what the Start menu can launch, as something that can actually be
 * launched later.
 *
 * Two sources, because one route doesn't cover both kinds of app:
 *
 *  - Store apps have an AppID like `Pkg_hash!App`, which only the shell's
 *    AppsFolder resolves. Those are taken from Get-StartApps.
 *  - Desktop apps appear in Get-StartApps too, but with an AppID of the form
 *    `{KnownFolderGuid}\relative\path.exe`, and AppsFolder does *not* resolve
 *    those — tested, it silently does nothing. Their Start-menu shortcut is
 *    what's launchable, so those come from the .lnk files directly.
 */
const SCRIPT = [
    "$ErrorActionPreference='SilentlyContinue';",
    "$out = New-Object System.Collections.ArrayList;",
    // Shortcuts first, so a desktop app is preferred over a same-named Store entry.
    '$roots = @("$env:ProgramData\\Microsoft\\Windows\\Start Menu\\Programs", "$env:APPDATA\\Microsoft\\Windows\\Start Menu\\Programs");',
    "foreach ($lnk in Get-ChildItem -Path $roots -Filter *.lnk -Recurse -ErrorAction SilentlyContinue) {",
    "  [void]$out.Add([pscustomobject]@{ name=$lnk.BaseName; value=$lnk.FullName }) };",
    "foreach ($app in Get-StartApps | Where-Object { $_.AppID -like '*!*' }) {",
    "  [void]$out.Add([pscustomobject]@{ name=$app.Name; value=('app:' + $app.AppID) }) };",
    "ConvertTo-Json -InputObject @($out) -Compress",
].join(" ");
/**
 * Entries the Start menu carries that aren't applications anyone wants a key
 * bound to — uninstallers, readmes, links to a vendor's website.
 */
const NOISE = /^(uninstall|readme|release notes|documentation|help|manual|website|visit )|uninstall$/i;
let cache$1;
let inflight;
/**
 * Marks a Store app's AppID, which needs the AppsFolder route rather than the
 * shell's usual "open this" handling. Anything without it is a path or a URL.
 */
const APP_PREFIX = "app:";
/** Lists installed applications. Never throws; an empty list just means none. */
async function listApps(force = false) {
    if (force)
        cache$1 = undefined;
    if (cache$1 && Date.now() - cache$1.at < CACHE_TTL_MS)
        return cache$1.apps;
    // Serialize: the property inspector can ask twice while the first run is out.
    inflight ??= query().finally(() => {
        inflight = undefined;
    });
    return inflight;
}
async function query() {
    if (process.platform !== "win32")
        return [];
    const started = Date.now();
    try {
        const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", SCRIPT], { timeout: TIMEOUT_MS, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const parsed = JSON.parse(stdout.trim() || "[]");
        const list = Array.isArray(parsed) ? parsed : [parsed];
        const apps = list
            .filter((e) => e?.name && e?.value && !NOISE.test(e.name.trim()))
            .map((e) => ({ name: e.name.trim(), target: e.value.trim() }));
        // A name can appear more than once (a shortcut in both the machine-wide and
        // per-user Start menu, or a Store entry alongside a desktop one). The
        // script emits shortcuts first, so keeping the first wins for those.
        const byName = new Map();
        for (const app of apps) {
            const key = app.name.toLowerCase();
            if (!byName.has(key))
                byName.set(key, app);
        }
        const unique = [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
        streamDeck.logger.info(`apps: found ${unique.length} installed app(s) in ${Date.now() - started}ms`);
        cache$1 = { at: Date.now(), apps: unique };
        return unique;
    }
    catch (err) {
        streamDeck.logger.warn("apps: could not enumerate installed applications", err);
        return [];
    }
}

/**
 * Opens whatever the user pointed the key at: an executable, a shortcut, a
 * document, or a URL/protocol like `steam://` — the shell decides, the same way
 * it would from Explorer or Finder.
 *
 * The child is detached and unreferenced so the app it starts outlives the
 * plugin process and doesn't hold Node's event loop open. Nothing is piped back:
 * a launched app's output isn't ours to collect.
 */
function openTarget(target) {
    const value = target.trim();
    if (value === "")
        return;
    // An app picked from the installed list is addressed by its Start-menu AppID,
    // which only the shell's AppsFolder can resolve — `start` can't. This is the
    // same route the Start menu takes, so Store apps and desktop apps both work.
    if (value.startsWith(APP_PREFIX)) {
        const appId = value.slice(APP_PREFIX.length);
        const child = node_child_process.spawn("explorer.exe", [`shell:AppsFolder\\${appId}`], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
        });
        child.unref();
        return;
    }
    const [command, args] = process.platform === "win32"
        ? // `start` needs its first quoted argument as the window title, or it
            // treats a quoted path as one.
            ["cmd.exe", ["/c", "start", "", value]]
        : process.platform === "darwin"
            ? ["open", [value]]
            : ["xdg-open", [value]];
    const child = node_child_process.spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
    child.unref();
}

/** Estimates need a real drop over a real interval, or the maths is noise. */
const MIN_DROP_PERCENT = 3;
const MIN_SPAN_MS = 10 * 60_000;
/** Beyond this the answer stops meaning anything useful. */
const MAX_ESTIMATE_MS = 14 * 24 * 60 * 60_000;
/**
 * Adds a reading to the history, and throws the history away when the level
 * goes up: a device that has been on a charger has no useful discharge history
 * behind it, and averaging across the charge would report nonsense.
 */
function recordSample(history, percent, at) {
    const samples = history ?? [];
    const last = samples[samples.length - 1];
    if (last && percent > last.percent)
        return [{ percent, at }];
    if (last && percent === last.percent)
        return samples;
    return [...samples, { percent, at }].slice(-8);
}
/**
 * Milliseconds until empty at the rate the level has actually been dropping,
 * or null when there isn't enough history to say.
 *
 * The oldest and newest samples give the rate. A median-of-intervals would
 * resist a single odd reading better, but wireless gauges move in steps of 10%
 * — over a handful of steps the endpoints *are* the trend, and anything
 * cleverer would be fitting noise.
 */
function estimateRemaining(history, percent, now) {
    if (!history || history.length < 2)
        return null;
    const first = history[0];
    const last = history[history.length - 1];
    const drop = first.percent - last.percent;
    const span = last.at - first.at;
    if (drop < MIN_DROP_PERCENT || span < MIN_SPAN_MS)
        return null;
    const msPerPercent = span / drop;
    const remaining = percent * msPerPercent - (now - last.at);
    if (remaining <= 0 || remaining > MAX_ESTIMATE_MS)
        return null;
    return remaining;
}
/** "3h 20m", "45m", "2d" — short enough for the key's name line. */
function formatDuration(ms) {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        const rest = minutes % 60;
        return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
    }
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours === 0 ? `${days}d` : `${days}d ${restHours}h`;
}
/**
 * The settings that describe how a key looks rather than what it watches.
 * Shared across keys by the "apply to all" button, via global settings.
 */
const APPEARANCE_KEYS = [
    "style",
    "showIcon",
    "showPercent",
    "showName",
    "showTimeLeft",
    "showOfflineAge",
    "lowThreshold",
    "mediumThreshold",
    "alertBelow",
    "colorLow",
    "colorMedium",
    "colorHigh",
    "colorCharging",
    "colorForeground",
    "colorBackground",
];
function extractAppearance(settings) {
    const appearance = {};
    for (const key of APPEARANCE_KEYS) {
        const value = settings[key];
        if (value !== undefined)
            Object.assign(appearance, { [key]: value });
    }
    return appearance;
}
/**
 * Kinds left out of "peripherals". A phone or a watch has its own charger and
 * its own reminders; counting them means the key spends most of its time
 * reporting a phone that is about to be plugged in anyway, and never mentions
 * the headset that's about to die mid-call.
 */
const PERSONAL_KINDS = new Set(["phone", "tablet", "watch"]);
function watchIncludes(scope, kind) {
    return scope === "everything" || !PERSONAL_KINDS.has(kind);
}
/**
 * Floor on the poll interval. A scan takes ~3s and discovery caches its result
 * for 10s, so anything faster than this would spend the extra polls re-drawing
 * the same cached numbers.
 */
const MIN_REFRESH_SECONDS = 10;
/**
 * v2: the charging colour moved from blue to green. v3: last-known level.
 * v4: the charging green was brightened. v5: the background went black.
 * v6: polling adapts by default.
 */
const SETTINGS_VERSION = 6;
const DEFAULTS = {
    refreshSeconds: 60,
    watch: "peripherals",
    pollMode: "adaptive",
    powerSource: "auto",
    showLastKnown: true,
    style: "bar",
    showIcon: false,
    showPercent: true,
    showName: true,
    showTimeLeft: false,
    showOfflineAge: true,
    iconKind: "auto",
    titleMode: "none",
    lowThreshold: 20,
    mediumThreshold: 50,
    colorLow: DEFAULT_COLORS.low,
    colorMedium: DEFAULT_COLORS.medium,
    colorHigh: DEFAULT_COLORS.high,
    colorCharging: DEFAULT_COLORS.charging,
    colorBackground: DEFAULT_COLORS.background,
    colorForeground: DEFAULT_COLORS.foreground,
    alertBelow: 0,
};
/**
 * Settings with the defaults applied, once, so the rest of the code can read a
 * field instead of remembering which default belongs to it.
 *
 * `?? DEFAULTS.x` was written out at eighteen call sites across three files,
 * which is eighteen chances to reach for the wrong default or forget one — and
 * a key whose settings predate a field relies on exactly that fallback.
 *
 * Explicit `undefined` is treated as absent: Stream Deck round-trips settings
 * through JSON, and a cleared control comes back as a present-but-undefined key
 * that would otherwise overwrite the default with nothing.
 */
function resolved(settings) {
    const set = {};
    for (const [key, value] of Object.entries(settings)) {
        if (value !== undefined)
            set[key] = value;
    }
    return { ...DEFAULTS, ...set };
}
/**
 * Brings a key's settings up to the current version, writing the appearance
 * defaults out the first time so the property inspector's controls start out
 * matching what's drawn rather than showing empty inputs.
 *
 * Returns undefined when the settings are already current, i.e. when there is
 * nothing to persist.
 */
function migrate(settings) {
    const version = settings.settingsVersion ?? (settings.configured ? 1 : 0);
    if (settings.configured && version >= SETTINGS_VERSION)
        return undefined;
    const migrated = { ...settings };
    // The charging colour has changed twice (blue -> green -> brighter green).
    // Only move a key that's still sitting on a colour this plugin chose for it;
    // one the user picked themselves is left alone.
    const chargingIsADefault = migrated.colorCharging === undefined || LEGACY_CHARGING_COLORS.includes(migrated.colorCharging);
    if (version < SETTINGS_VERSION && chargingIsADefault) {
        migrated.colorCharging = DEFAULTS.colorCharging;
    }
    // Same rule for the background, which went from near-black to black: a key
    // still on a shipped default follows, one the user set keeps what it has.
    const backgroundIsADefault = migrated.colorBackground === undefined || LEGACY_BACKGROUND_COLORS.includes(migrated.colorBackground);
    if (version < SETTINGS_VERSION && backgroundIsADefault) {
        migrated.colorBackground = DEFAULTS.colorBackground;
    }
    // v5 -> v6: adaptive became the default. Keys sitting on "fixed" are there
    // because that was the shipped default rather than because anyone chose it,
    // so they follow — the same rule the colours use. Choosing fixed again after
    // this sticks, since the version has already moved past it.
    if (version < SETTINGS_VERSION && (migrated.pollMode === undefined || migrated.pollMode === "fixed")) {
        migrated.pollMode = DEFAULTS.pollMode;
    }
    // v2 -> v3 added showLastKnown; the defaults merge below turns it on.
    return { ...DEFAULTS, ...migrated, configured: true, settingsVersion: SETTINGS_VERSION };
}
function refreshSeconds(settings) {
    return Math.max(MIN_REFRESH_SECONDS, resolved(settings).refreshSeconds);
}
/**
 * Adaptive polling policy. A scan costs two spawned processes and a couple of
 * HID handles, so the point is to spend them when the number is actually moving
 * and not when it isn't.
 */
const ADAPTIVE = {
    /** Charging climbs fast enough to be worth watching. */
    chargingSeconds: 15,
    /** So does a level that's about to run out. */
    lowSeconds: 30,
    /** Nothing to read from a device that's gone; a key press still forces one. */
    offlineSeconds: 120,
    /** Each unchanged reading stretches the wait by this much... */
    backoff: 1.5,
    /** ...up to here. */
    maxSeconds: 600,
};
/**
 * How long to wait before reading again, given what the last reading said and
 * how many readings in a row have shown the same percentage.
 *
 * The configured interval is the baseline: charging and low levels can only
 * shorten it, never lengthen it, so a key set to 15s stays responsive; a steady
 * level backs off from it; and MIN_REFRESH_SECONDS is still the floor.
 */
function adaptiveSeconds(settings, reading, unchanged) {
    const base = refreshSeconds(settings);
    if (!reading)
        return base;
    const quicker = (seconds) => Math.max(MIN_REFRESH_SECONDS, Math.min(base, seconds));
    if (reading.status === "charging")
        return quicker(ADAPTIVE.chargingSeconds);
    const low = resolved(settings).lowThreshold;
    if (reading.percent !== null && reading.percent <= low)
        return quicker(ADAPTIVE.lowSeconds);
    // A device that isn't there costs the same scan as one that is, and reports
    // nothing new until it comes back.
    if (reading.status === "not-found" || reading.status === "error") {
        return Math.max(base, ADAPTIVE.offlineSeconds);
    }
    return Math.min(ADAPTIVE.maxSeconds, Math.round(base * ADAPTIVE.backoff ** unchanged));
}
/** The wait before the next reading, in whichever mode the key is set to. */
function nextPollSeconds(settings, reading, unchanged) {
    return resolved(settings).pollMode === "adaptive"
        ? adaptiveSeconds(settings, reading, unchanged)
        : refreshSeconds(settings);
}
/** What the panel's colour control emits, and the only thing worth trusting. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
/**
 * A stored colour, or the default when it isn't one.
 *
 * These strings are interpolated straight into SVG attributes, so anything but a
 * plain hex colour is refused rather than escaped: the panel's `sdpi-color`
 * control can only ever produce one, and a settings file that holds something
 * else has been hand-edited or corrupted. Falling back to the default keeps a
 * key readable instead of painting a face out of a broken value.
 */
function safeColor(value, fallback) {
    return value !== undefined && HEX_COLOR.test(value.trim()) ? value.trim() : fallback;
}
function faceColors(settings) {
    return {
        low: safeColor(settings.colorLow, DEFAULTS.colorLow),
        medium: safeColor(settings.colorMedium, DEFAULTS.colorMedium),
        high: safeColor(settings.colorHigh, DEFAULTS.colorHigh),
        charging: safeColor(settings.colorCharging, DEFAULTS.colorCharging),
        background: safeColor(settings.colorBackground, DEFAULTS.colorBackground),
        foreground: safeColor(settings.colorForeground, DEFAULTS.colorForeground),
    };
}

/**
 * Replies to the open panel. Everything goes out through here so a payload has
 * to match {@link UiReply} — the shapes were previously written inline at each
 * call site, which let the same event answer differently from two actions.
 */
function replyToPanel(reply) {
    return streamDeck.ui.sendToPropertyInspector(reply);
}

/** Charging pulse: 8 steps of 450ms, i.e. a slow ~3.6s breath. */
const PULSE_INTERVAL_MS = 450;
const PULSE_STEPS = 8;
/**
 * The machinery every battery key shares: a poll chain, the charging pulse, the
 * warning latch, title handling, and painting a face.
 *
 * Subclasses supply the two things that actually differ — where the reading
 * comes from ({@link read}) and how it's presented ({@link present}). Everything
 * else was duplicated across the actions before this existed, and had already
 * started to drift.
 */
class KeyFaceAction extends SingletonAction {
    keys = new Map();
    /** The device's name for titles. Overridden where a nickname can apply. */
    label(_settings, reading) {
        return reading.deviceLabel;
    }
    /**
     * Extra defaults a subclass wants written into a brand-new key, on top of the
     * migration every key gets. Empty for a key that has nothing of its own.
     */
    freshDefaults() {
        return {};
    }
    /**
     * Settings written the first time a key appears: the migration, plus the look
     * already shared across the deck if there is one.
     *
     * A key dropped onto a deck that has a shared appearance should match it
     * rather than arrive in the shipped defaults and need setting up again.
     */
    async ensureDefaults(action, settings) {
        const migrated = migrate(settings);
        if (!migrated)
            return settings;
        const shared = settings.configured ? undefined : await sharedAppearance();
        const merged = { ...this.freshDefaults(), ...migrated, ...(shared ?? {}) };
        await action.setSettings(merged);
        return merged;
    }
    /**
     * The panel requests both battery actions answer the same way. A subclass
     * overrides this for its own events and calls `super` for the rest.
     */
    async onSendToPlugin(ev) {
        if (ev.payload?.event === "getApps") {
            await this.sendApps(ev.payload?.isRefresh === true);
            return;
        }
        if (ev.payload?.event === "shareAppearance") {
            const source = this.keys.get(ev.action.id)?.drawn?.settings;
            if (source) {
                await shareAppearance(extractAppearance(source));
                streamDeck.logger.info(`${this.constructor.name}: appearance shared with every key`);
            }
        }
    }
    async onWillAppear(ev) {
        if (!ev.action.isKey())
            return;
        const settings = await this.ensureDefaults(ev.action, ev.payload.settings);
        await this.refresh(ev.action, settings);
        this.schedule(ev.action, settings);
    }
    onWillDisappear(ev) {
        const state = this.keys.get(ev.action.id);
        if (!state)
            return;
        clearTimeout(state.pollTimer);
        clearInterval(state.pulseTimer);
        clearTimeout(state.noticeTimer);
        this.keys.delete(ev.action.id);
    }
    async onKeyDown(ev) {
        // First, because it's the part the press is visibly for: waiting on a scan
        // before launching would make the app feel slow to open.
        this.openConfiguredTarget(ev.payload.settings);
        await this.onPress(ev);
    }
    /** A press reads immediately; subclasses extend this for their own extras. */
    async onPress(ev) {
        await this.refresh(ev.action, ev.payload.settings, true);
    }
    async onDidReceiveSettings(ev) {
        if (!ev.action.isKey())
            return;
        const settings = ev.payload.settings;
        const state = this.state(ev.action.id);
        // Appearance edits repaint from the last reading with no device I/O, so
        // dragging a colour or a slider follows the pointer.
        if (state.drawn && !(await this.needsReread(ev.action, settings))) {
            state.drawn.settings = settings;
            await this.render(ev.action, settings, state.drawn.reading, state.drawn.kind);
        }
        else {
            await this.refresh(ev.action, settings);
        }
        // Restarting the timer on every keystroke would keep pushing the next poll
        // out of reach, so only do it when the interval or the mode changed.
        const mode = resolved(settings).pollMode;
        if (state.pollBase !== refreshSeconds(settings) || state.pollMode !== mode) {
            this.schedule(ev.action, settings);
        }
    }
    /** Whether an edit changed what's watched, rather than how it looks. */
    async needsReread(_action, _settings) {
        return false;
    }
    /** Adopts a shared look. Called for every key when global settings change. */
    async applyShared(appearance) {
        await applyAppearance(this.actions, appearance);
    }
    state(actionId) {
        let state = this.keys.get(actionId);
        if (!state) {
            state = { pulsePhase: 0, unchanged: 0 };
            this.keys.set(actionId, state);
        }
        return state;
    }
    /** Feeds an app picker; both battery actions offer one. */
    async sendApps(force) {
        const apps = await listApps(force);
        const items = apps.map((app) => ({ label: app.name, value: app.target }));
        items.unshift({ label: "Don't open anything", value: "" });
        await replyToPanel({ event: "getApps", items });
    }
    /**
     * Arms the next poll. Each tick re-arms itself, so an adaptive key can widen
     * or narrow its own interval as the reading changes.
     */
    schedule(action, settings) {
        const state = this.state(action.id);
        clearTimeout(state.pollTimer);
        state.pollBase = refreshSeconds(settings);
        state.pollMode = resolved(settings).pollMode;
        const seconds = nextPollSeconds(settings, state.drawn?.reading, state.unchanged);
        state.pollTimer = setTimeout(() => {
            // Read the settings fresh on every tick. Closing over the settings from
            // when the timer was created would repaint with a stale appearance,
            // silently undoing any edit made since.
            // Whatever the tick managed to read, so a failure after the fetch still
            // rearms from current settings rather than the ones this timer was
            // created with — reviving a poll interval the user has since changed.
            let latest = settings;
            action
                .getSettings()
                .then(async (current) => {
                latest = current;
                await this.refresh(action, current);
            })
                .catch((err) => {
                streamDeck.logger.error(`${this.constructor.name}: scheduled refresh failed`, err);
            })
                // Keep the chain alive; a failed tick shouldn't stop the key updating.
                .finally(() => this.schedule(action, latest));
        }, seconds * 1000);
    }
    async refresh(action, settings, force = false) {
        try {
            const result = await this.read(action, settings, force);
            await this.draw(action, result.settings, result.reading, result.kind);
            await this.warnOnCrossing(action, result.settings, result.reading);
        }
        catch (err) {
            streamDeck.logger.error(`${this.constructor.name}: refresh threw`, err);
            await this.draw(action, settings, { deviceLabel: settings.deviceLabel ?? "Error", percent: null, status: "error" }, settings.deviceKind ?? "other");
        }
    }
    /**
     * Flashes the warning when the level crosses below the threshold — once per
     * trip, not once per poll.
     *
     * Firing on every reading under the threshold is six flashes a minute at a 10s
     * interval, which is enough to make anyone turn the warning off entirely and
     * lose the one alert that mattered. A last-known level never counts: a device
     * left off below the threshold would warn forever.
     */
    async warnOnCrossing(action, settings, reading) {
        const alertBelow = resolved(settings).alertBelow;
        const state = this.state(action.id);
        if (alertBelow <= 0 || reading.percent === null || reading.status === "stale")
            return;
        if (reading.percent >= alertBelow || reading.status === "charging") {
            state.alerted = false;
            return;
        }
        if (state.alerted)
            return;
        state.alerted = true;
        await action.showAlert();
    }
    /**
     * Renders and remembers the reading, so later edits can repaint it for free.
     * What's cached is the live reading, before any substitution a subclass makes
     * at render time — that's what lets toggling those settings repaint without
     * touching the device.
     */
    async draw(action, settings, reading, kind) {
        const state = this.state(action.id);
        // A number that came off the device just now — the moment worth reporting
        // as "last connected", regardless of whether the level moved.
        if (reading.percent !== null && reading.status !== "stale")
            state.lastLiveAt = Date.now();
        const previous = state.drawn?.reading;
        const same = previous?.percent === reading.percent && previous?.deviceLabel === reading.deviceLabel;
        state.unchanged = same ? state.unchanged + 1 : 0;
        state.drawn = { reading, kind, settings };
        if (reading.status === "charging")
            this.startPulse(action);
        else
            this.stopPulse(action.id);
        await this.render(action, settings, reading, kind);
    }
    /**
     * Drives the charging animation. Stream Deck rasterises the SVG once per
     * setImage, so animation means re-sending the image; each frame is a pure
     * re-render off the cached reading, with no device I/O.
     */
    startPulse(action) {
        const state = this.state(action.id);
        if (state.pulseTimer)
            return;
        state.pulseTimer = setInterval(() => {
            const drawn = state.drawn;
            if (!drawn || drawn.reading.status !== "charging") {
                this.stopPulse(action.id);
                return;
            }
            state.pulsePhase = (state.pulsePhase + 1) % PULSE_STEPS;
            this.render(action, drawn.settings, drawn.reading, drawn.kind, state.pulsePhase).catch((err) => streamDeck.logger.error(`${this.constructor.name}: pulse frame failed`, err));
        }, PULSE_INTERVAL_MS);
    }
    stopPulse(actionId) {
        const state = this.keys.get(actionId);
        if (!state?.pulseTimer)
            return;
        clearInterval(state.pulseTimer);
        state.pulseTimer = undefined;
        state.pulsePhase = 0;
    }
    /** Paints the key from a live reading; `live` is what came off the device. */
    async render(action, settings, live, kind, phase = 0) {
        // A message owns the key while it's up; the reading behind it is cached
        // and gets drawn when the message clears.
        if (this.state(action.id).showingNotice)
            return;
        const face = this.present(action, settings, live, kind);
        const look = resolved(settings);
        await action.setImage(batteryKeyImage({
            percent: face.reading.percent,
            status: face.reading.status,
            kind: face.kind,
            name: face.name,
            style: look.style,
            showIcon: look.showIcon,
            showPercent: look.showPercent,
            showName: face.name !== "",
            lowThreshold: look.lowThreshold,
            mediumThreshold: look.mediumThreshold,
            colors: faceColors(settings),
            lowest: face.lowest,
            // Sine so the breath eases at both ends instead of ramping linearly.
            pulse: (Math.sin((2 * Math.PI * phase) / PULSE_STEPS) + 1) / 2,
        }));
        await this.applyTitle(action, settings, face.reading);
    }
    /**
     * Writes the key's title, or gives it back.
     *
     * Switching away from a title has to actively undo what was written, or the
     * last one stays on the key for good. `setTitle()` with no argument is the
     * undo: Stream Deck restores the manifest's title.
     *
     * The applied value is remembered so a repaint doesn't re-send an unchanged
     * title, and it starts unset so the first paint after a restart always writes
     * — which is what clears a title left by a previous run.
     */
    async applyTitle(action, settings, reading) {
        const mode = resolved(settings).titleMode;
        let wanted;
        if (mode === "device") {
            wanted = this.label(settings, reading);
        }
        else if (mode === "percent") {
            // A last-known level gets a "~" so the title doesn't claim to be current.
            const prefix = reading.status === "stale" ? "~" : "";
            wanted = reading.percent === null ? "" : `${prefix}${reading.percent}%`;
        }
        const state = this.state(action.id);
        if (state.titleApplied?.value === wanted)
            return;
        await action.setTitle(wanted);
        state.titleApplied = { value: wanted };
    }
    /**
     * Opens the app, file or URL the key is pointed at, if it's set to.
     *
     * A failure is logged rather than shown: the key's warning means "your device
     * is gone", and giving it a second meaning would blunt both.
     */
    openConfiguredTarget(settings) {
        // A typed path beats the picker, so the text box can override without
        // having to clear the list first.
        const target = settings.pressCustomTarget?.trim() || settings.pressTarget?.trim();
        if (!target)
            return;
        try {
            streamDeck.logger.info(`${this.constructor.name}: press opens ${target}`);
            openTarget(target);
        }
        catch (err) {
            streamDeck.logger.error(`${this.constructor.name}: couldn't open ${target}`, err);
        }
    }
}

/**
 * Read-through cache. Global settings are a round-trip to Stream Deck, and
 * labels are resolved on every repaint — including every pulse frame.
 */
let cache;
async function loadRenames(force = false) {
    if (cache && !force)
        return cache;
    const global = await streamDeck.settings.getGlobalSettings();
    cache = global?.renames ?? {};
    return cache;
}
/** Keeps the cache honest when the map changes, from any key or any action. */
function cacheRenames(renames) {
    cache = renames ?? {};
}
/** What's cached right now; empty until the first load, which happens at startup. */
function renames() {
    return cache ?? {};
}
/** Sets or clears one name, leaving the rest of the map alone. */
async function setRename(deviceKey, name) {
    const global = await streamDeck.settings.getGlobalSettings();
    const next = { ...(global?.renames ?? {}) };
    const trimmed = name.trim();
    if (trimmed === "")
        delete next[deviceKey];
    else
        next[deviceKey] = trimmed;
    await streamDeck.settings.setGlobalSettings({ ...global, renames: next });
    cacheRenames(next);
    return next;
}
/**
 * The name to show for a device: what the user called it, or what it calls
 * itself. Used everywhere a label is rendered, so a rename reaches the key face,
 * the picker, the titles and both actions without each one knowing about it.
 */
function labelOf(deviceKey, reported) {
    if (!deviceKey)
        return reported;
    return renames()[deviceKey] ?? reported;
}
/** Applies the map across a scan, for anything that consumes whole devices. */
function withRenames(devices) {
    const map = renames();
    if (Object.keys(map).length === 0)
        return devices;
    return devices.map((device) => {
        const renamed = map[device.key];
        if (!renamed)
            return device;
        return {
            ...device,
            label: renamed,
            reading: device.reading ? { ...device.reading, deviceLabel: renamed } : device.reading,
        };
    });
}

/**
 * Guessing whether a device is on a charger, for providers that can't say.
 *
 * The Windows PnP battery property — which is how a phone or a plain Bluetooth
 * peripheral reports — carries a percentage and nothing else, so a handset on a
 * cable looks exactly like one in a pocket. The one thing that can't happen off
 * a charger is the level going *up*, so that's the whole signal.
 *
 * Kept apart from the action because it's the only interesting decision in the
 * charging story, and testing it through a Stream Deck key would mean standing
 * up the whole plugin to assert on a boolean.
 */
/**
 * How long a level may hold below 100% before the guess is dropped.
 *
 * A charger keeps nudging the level up every few minutes; something unplugged
 * just holds wherever it stopped. Past a real charge's cadence, a hold looks
 * like a phone back in a pocket rather than one still on the cable.
 */
const CHARGE_HOLD_MS = 20 * 60_000;
/**
 * Folds a new reading into the guess.
 *
 * Rising means charging. A drop means it isn't. A level that merely *holds*
 * keeps the guess — but only at 100%, where holding is what a full battery on a
 * charger does, or for {@link CHARGE_HOLD_MS} below that, after which a hold is
 * better explained by the cable having been pulled out.
 *
 * Returns a fresh object rather than mutating, so a caller can't half-apply it.
 */
function nextChargeGuess(guess, previousPercent, percent, now) {
    let { rising, risingSince } = guess;
    if (previousPercent !== undefined) {
        if (percent > previousPercent) {
            rising = true;
            risingSince = now;
        }
        else if (percent < previousPercent) {
            return { ...guess, rising: false, risingSince: undefined };
        }
    }
    if (!rising)
        return { ...guess, rising: false, risingSince: undefined };
    // A full battery sitting on a charger holds indefinitely and is still
    // charging; below full, a hold that outlasts the window is an unplugged one.
    if (percent < 100 && risingSince !== undefined && now - risingSince > CHARGE_HOLD_MS) {
        return { ...guess, rising: false, risingSince: undefined };
    }
    return { ...guess, rising, risingSince };
}

/** Shown on the key when it's pressed while its device isn't connected. */
const DISCONNECTED_NOTICE = "Device is Disconnected";
const NOTICE_MS = 2500;
/**
 * How long the persisted "last seen" stamp may drift before it's rewritten.
 *
 * The live age comes from memory and is exact; this copy exists so a key that
 * has just been restarted can still say roughly when the device was last there.
 * Rewriting it on every poll would be a settings write a minute, forever.
 */
const LAST_SEEN_TOUCH_MS = 5 * 60_000;
/**
 * How a device reads in the picker. Everything detected is listed, so the entry
 * has to say why one of them won't show a percentage.
 */
function pickerLabel(device) {
    if (device.supportsBattery)
        return device.label;
    if (device.reading?.status === "mains")
        return `${device.label} (mains powered)`;
    return `${device.label} (no battery data)`;
}
/** One line for the property inspector's status strip, in the user's terms. */
function statusWording(reading) {
    switch (reading.status) {
        case "charging":
            return reading.detail === "Charge complete" ? "On the charger, full" : "Charging";
        case "mains":
            return "Mains powered";
        case "stale":
            return "Disconnected — last known level";
        case "not-found":
            return "Not detected";
        case "unsupported":
            return "No battery to read";
        case "error":
            return "Couldn't be read";
        default:
            return "Connected";
    }
}
/** Which of the strip's three looks to use. */
function statusTone(status) {
    if (status === "charging")
        return "charging";
    if (status === "stale" || status === "not-found" || status === "error")
        return "offline";
    if (status === "ok" || status === "mains")
        return "ok";
    return "idle";
}
/**
 * Coarse "how long ago", e.g. "12m" / "3h" / "2d". Empty for anything under a
 * minute (and for a missing timestamp), where "0m ago" would say nothing.
 */
function ageLabel(at) {
    if (at === undefined)
        return "";
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1)
        return "";
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
/**
 * One device on one key: its level, and what it's doing.
 *
 * The polling, pulsing, titles and warnings live in {@link KeyFaceAction}. What
 * belongs here is everything specific to watching one chosen device — resolving
 * it, remembering what it last said, and the substitutions that make a missing
 * reading useful rather than blank.
 */
let BatteryStatusAction = (() => {
    let _classDecorators = [action({ UUID: "com.emilberglund.batterymonitor.battery-status" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = KeyFaceAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /**
         * The charge guess for a key, created on first use. Lives on {@link KeyState}
         * so it's discarded with the rest of the key's state when the key goes away.
         */
        charge(actionId) {
            const state = this.state(actionId);
            return (state.charge ??= { rising: false });
        }
        async read(action, settings, force) {
            const charge = this.charge(action.id);
            charge.deviceKey = settings.deviceKey;
            const device = await this.resolve(action, settings, force);
            if (!device) {
                // A device that comes back at a higher level was charged somewhere else,
                // which isn't the same as charging now.
                charge.rising = false;
                charge.risingSince = undefined;
                return {
                    settings,
                    kind: settings.deviceKind ?? "other",
                    reading: {
                        deviceLabel: settings.deviceLabel ?? "No device",
                        percent: null,
                        status: "not-found",
                        detail: settings.deviceKey
                            ? `${settings.deviceLabel ?? settings.deviceKey} not detected`
                            : "No battery-capable device detected",
                    },
                };
            }
            // discover() already read the battery for most providers; only pay for a
            // second round-trip when the scan didn't produce one (or it's stale).
            const reported = !force && device.reading ? device.reading : await this.readDevice(device);
            // Compared against the stored level, so this has to happen before
            // `remember` overwrites it with the new one.
            const live = this.inferCharging(action.id, settings, device, reported);
            // Persist first: a fresh percentage becomes the fallback for the next time
            // the device is gone, and `remember` may correct the label/kind.
            const current = await this.remember(action, settings, device, live);
            if (live.status === "error") {
                streamDeck.logger.warn(`battery-status: ${device.key} error: ${live.detail}`);
            }
            return { settings: current, reading: live, kind: device.kind };
        }
        /**
         * Applies this key's substitutions at render time rather than at read time, so
         * toggling any of them repaints from the cached reading without touching the
         * device.
         */
        present(action, settings, live, kind) {
            const reading = this.forPowerSource(settings, this.withLastKnown(settings, live));
            const lastLiveAt = this.state(action.id).lastLiveAt;
            // "auto" believes the provider; anything else is the user saying they know
            // better, which for a device the OS calls "Bluetooth device" they do.
            const drawnKind = settings.iconKind && settings.iconKind !== "auto" ? settings.iconKind : kind;
            return { reading, kind: drawnKind, name: this.nameLine(settings, reading, lastLiveAt) };
        }
        /**
         * What to call the device. A nickname typed on this key wins over the one it
         * reports — Windows names one phone on the dev machine "4", and no amount of
         * probing improves on a name the owner chose.
         */
        label(settings, reading) {
            // Nickname is this key's own answer and wins; a rename is the plugin-wide
            // one; the device's own name is the fallback.
            return settings.displayName?.trim() || labelOf(settings.deviceKey, reading.deviceLabel);
        }
        /** Only a changed device needs a lookup; appearance edits repaint for free. */
        async needsReread(action, settings) {
            return this.state(action.id).charge?.deviceKey !== settings.deviceKey;
        }
        /**
         * A press means "tell me now", so it bypasses the discovery cache — and a
         * forced scan takes a couple of seconds.
         *
         * The warning therefore goes up *before* the scan rather than after it. The
         * key already knows the device was missing a moment ago, and that's what the
         * press is asking about; waiting for the rescan to confirm it would leave the
         * press looking ignored for as long as the scan takes.
         */
        async onPress(ev) {
            const known = this.state(ev.action.id).drawn;
            const wasDisconnected = known?.reading.status === "not-found";
            if (wasDisconnected && known)
                await this.notify(ev.action, known.settings);
            await this.refresh(ev.action, ev.payload.settings, true);
            // The scan can also be what discovers the device is gone, in which case
            // this is the first chance to say so.
            const now = this.state(ev.action.id).drawn;
            if (!wasDisconnected && now?.reading.status === "not-found") {
                await this.notify(ev.action, now.settings);
            }
        }
        async onSendToPlugin(ev) {
            if (ev.payload?.event === "getStatus") {
                await this.sendStatus(ev.action.id);
                return;
            }
            if (ev.payload?.event === "getHeadsetTool") {
                const binary = await findHeadsetControl();
                await replyToPanel({ event: "getHeadsetTool", installed: binary !== null, binary });
                return;
            }
            if (ev.payload?.event === "openHeadsetTool") {
                // Stream Deck opens it in the real browser; the inspector is a webview
                // with no place to put a page.
                await streamDeck.system.openUrl(HEADSETCONTROL_RELEASES);
                return;
            }
            // getApps and shareAppearance are answered identically by both battery
            // actions, so they're handled once in the base class.
            if (ev.payload?.event !== "getDevices") {
                await super.onSendToPlugin(ev);
                return;
            }
            const force = ev.payload?.isRefresh === true;
            streamDeck.logger.info(`battery-status: property inspector requested devices (force=${force})`);
            const devices = withRenames(await discovery.list(force));
            const settings = await ev.action.getSettings();
            const items = devices.map((d) => ({ label: pickerLabel(d), value: d.key }));
            // Keep a previously chosen but currently absent device selectable, otherwise
            // the dropdown would silently clear the user's configuration.
            if (settings.deviceKey && !devices.some((d) => d.key === settings.deviceKey)) {
                items.push({
                    label: `${settings.deviceLabel ?? settings.deviceKey} (not detected)`,
                    value: settings.deviceKey,
                });
            }
            if (items.length === 0) {
                items.push({ label: "No devices detected — press the refresh button", value: "" });
            }
            await replyToPanel({ event: "getDevices", items });
        }
        /**
         * Tells the property inspector what the key is currently showing, so the panel
         * opens with an answer rather than only questions. It reports the reading
         * already drawn — no device is touched — so the panel can ask as often as it
         * likes.
         */
        async sendStatus(actionId) {
            const drawn = this.keys.get(actionId)?.drawn;
            if (!drawn) {
                await replyToPanel({ event: "getStatus", status: null });
                return;
            }
            const settings = drawn.settings;
            const reading = this.forPowerSource(settings, this.withLastKnown(settings, drawn.reading));
            const age = ageLabel(this.keys.get(actionId)?.lastLiveAt ?? settings.lastSeenAt);
            await replyToPanel({
                event: "getStatus",
                status: {
                    label: this.label(settings, reading),
                    percent: reading.percent,
                    state: reading.status === "stale" && age ? `Disconnected — last seen ${age} ago` : statusWording(reading),
                    tone: statusTone(reading.status),
                },
            });
        }
        /**
         * Puts a message on the key for a moment. Painting is suspended while it's up
         * — the refresh running behind it would otherwise replace it with the face
         * mid-message — and resumes when the face is restored.
         */
        async notify(action, settings) {
            const state = this.state(action.id);
            clearTimeout(state.noticeTimer);
            state.showingNotice = true;
            await action.showAlert();
            await action.setImage(noticeKeyImage(DISCONNECTED_NOTICE, faceColors(settings)));
            state.noticeTimer = setTimeout(() => {
                state.showingNotice = false;
                const current = state.drawn;
                if (!current)
                    return;
                this.render(action, current.settings, current.reading, current.kind).catch((err) => streamDeck.logger.error("battery-status: restoring the face after a notice failed", err));
            }, NOTICE_MS);
        }
        /** Maps the stored device key to a currently-detected device. */
        async resolve(action, settings, force) {
            if (settings.deviceKey)
                return discovery.find(settings.deviceKey, force);
            // Nothing configured yet: pick something useful so a freshly dropped key
            // isn't blank, and persist it so the property inspector agrees.
            const devices = await discovery.list(force);
            const pick = devices.find((d) => d.supportsBattery) ?? devices[0];
            if (pick)
                await action.setSettings({ ...settings, deviceKey: pick.key });
            return pick;
        }
        async readDevice(device) {
            const provider = discovery.provider(device.providerId);
            if (!provider) {
                return {
                    deviceLabel: device.label,
                    percent: null,
                    status: "error",
                    detail: `Unknown provider ${device.providerId}`,
                };
            }
            return provider.read(device);
        }
        /**
         * Marks a device as charging when its level is going up, for providers that
         * can't tell us directly.
         *
         * A source like the Windows PnP battery property gives a percentage and
         * nothing else, so a phone on a charger looks exactly like one in a pocket. A
         * level that has risen since the last reading is the one thing that can't
         * happen off a charger, so that's the signal; it stays set while the level
         * holds (a phone parked at 100% is still plugged in) and clears when the level
         * drops. It's a guess, and below 100% it's time-boxed too — see
         * CHARGE_HOLD_MS — otherwise unplugging at a level the device then holds
         * would keep the bolt for as long as the device is slow to lose that level.
         */
        inferCharging(actionId, settings, device, reading) {
            const provider = discovery.provider(device.providerId);
            if (provider?.reportsCharging !== false)
                return reading;
            if (reading.status !== "ok" || reading.percent === null)
                return reading;
            const state = this.state(actionId);
            const next = nextChargeGuess(this.charge(actionId), settings.lastPercent, reading.percent, Date.now());
            state.charge = next;
            if (!next.rising)
                return reading;
            return { ...reading, status: "charging", detail: "Level rising — assumed to be charging" };
        }
        /**
         * Substitutes the last known level when the live reading has no number of its
         * own, so a device that's off or out of range shows where it was rather than a
         * dash. The result is marked "stale" so the face renders it faded — the level
         * is still useful, it just isn't current.
         */
        withLastKnown(settings, reading) {
            if (reading.percent !== null)
                return reading;
            if (!resolved(settings).showLastKnown)
                return reading;
            if (reading.status === "mains")
                return reading;
            // A stored level is the proof that matters. "unsupported" normally means
            // the device has no battery to read — but a ROG receiver whose keyboard is
            // switched off says exactly that, because the dongle is still plugged in
            // and only the device behind it went quiet. If this key has read a
            // percentage from it before, the battery is real and the provider is
            // saying "no answer just now", which is what being offline looks like.
            const percent = settings.lastPercent;
            if (percent === undefined)
                return reading;
            const age = ageLabel(settings.lastSeenAt);
            return {
                ...reading,
                percent,
                status: "stale",
                detail: `${reading.detail ?? reading.deviceLabel} — last known ${percent}%${age ? ` (${age} ago)` : ""}`,
            };
        }
        /**
         * Applies the key's power-source setting. Telling a key its device is always
         * plugged in wins over whatever came back: a Bluetooth speaker that reports no
         * level is indistinguishable from a headset whose battery can't be read, and
         * only the user knows which one is on the desk.
         */
        forPowerSource(settings, reading) {
            if (resolved(settings).powerSource !== "mains")
                return reading;
            if (reading.status === "mains")
                return reading;
            return { deviceLabel: reading.deviceLabel, percent: null, status: "mains", detail: "Always plugged in" };
        }
        /**
         * Caches what a disconnected device still needs to render: its label and kind,
         * plus the last percentage it actually reported. Both go out in one write, so
         * neither can overwrite the other with a stale copy of the settings.
         */
        async remember(action, settings, device, reading) {
            const patch = {};
            if (settings.deviceLabel !== device.label || settings.deviceKind !== device.kind) {
                patch.deviceKey = device.key;
                patch.deviceLabel = device.label;
                patch.deviceKind = device.kind;
            }
            if (reading.percent !== null) {
                const drifted = Date.now() - (settings.lastSeenAt ?? 0) > LAST_SEEN_TOUCH_MS;
                if (settings.lastPercent !== reading.percent || drifted) {
                    patch.lastPercent = reading.percent;
                    patch.lastSeenAt = Date.now();
                }
                // Only a changed level is worth a sample; repeats say nothing about the
                // rate and would just push real history out of the window.
                if (settings.lastPercent !== reading.percent) {
                    patch.history = recordSample(settings.history, reading.percent, Date.now());
                }
            }
            if (Object.keys(patch).length === 0)
                return settings;
            const merged = { ...settings, ...patch };
            await action.setSettings(merged);
            return merged;
        }
        /**
         * Text for the small line under the meter — empty when there shouldn't be one.
         *
         * There's no user-typed title to defer to: the actions set
         * `UserTitleEnabled: false`, so Stream Deck hides its Title field and
         * "Nickname" is the single place a key is named.
         */
        nameLine(settings, reading, lastLiveAt) {
            if (!resolved(settings).showName)
                return "";
            return this.deviceLine(settings, reading, lastLiveAt);
        }
        /**
         * The device's own line: its label, prefixed with how long ago the level was
         * read while it's offline. The age goes first because the line is truncated
         * from the right, and "how old is this number" is the part worth keeping.
         *
         * With "time left" on, the estimate takes the line instead: on a 72px key
         * there's room for one of the two, and "2h 40m" is the more useful of them
         * once you already know which key is which.
         */
        deviceLine(settings, reading, lastLiveAt) {
            const label = this.label(settings, reading);
            if (settings.showTimeLeft && reading.status === "ok" && reading.percent !== null) {
                const remaining = estimateRemaining(settings.history, reading.percent, Date.now());
                if (remaining !== null)
                    return formatDuration(remaining);
                // Say so rather than quietly falling back to the device name: an estimate
                // needs a real fall over a real interval, and a key that looks unchanged
                // is indistinguishable from a setting that did nothing.
                return "measuring…";
            }
            if (reading.status !== "stale")
                return label;
            if (!resolved(settings).showOfflineAge)
                return label;
            // In-memory first: it's exact. The persisted stamp is the fallback after a
            // restart, when nothing in memory knows when the device was last seen.
            const age = ageLabel(lastLiveAt ?? settings.lastSeenAt);
            return age ? `${age} · ${label}` : label;
        }
    });
    return _classThis;
})();

/**
 * Renames devices for this plugin, everywhere at once.
 *
 * Windows calls one phone on the dev machine "4", and a Bluetooth speaker
 * "Bluetooth device"; the name comes from the OS or the device's own descriptor
 * and often can't be fixed at the source. A key's Nickname solves it for that
 * one key — this solves it for every key, every picker and both other actions,
 * because the name belongs to the device rather than to a key.
 *
 * Nothing outside this plugin is touched: no OS record, no device firmware. The
 * map is applied on the way out, wherever a label is shown.
 */
let DeviceRenamingAction = (() => {
    let _classDecorators = [action({ UUID: "com.emilberglund.batterymonitor.device-renaming" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = SingletonAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /** Device each panel was last pointed at, to notice when it's switched. */
        targets = new Map();
        async onWillAppear(ev) {
            if (!ev.action.isKey())
                return;
            await loadRenames(true);
            this.targets.set(ev.action.id, ev.payload.settings.renameTarget?.trim() ?? "");
            await this.draw(ev.action, ev.payload.settings);
        }
        /**
         * Forgets the key. Without this the map keeps an entry for every panel ever
         * shown, including keys long since dragged off a profile.
         */
        onWillDisappear(ev) {
            this.targets.delete(ev.action.id);
        }
        /** A press rescans, so a device that was off can be named without waiting. */
        async onKeyDown(ev) {
            await discovery.list(true);
            await this.draw(ev.action, ev.payload.settings);
            await this.sendDevices(true);
        }
        async onDidReceiveSettings(ev) {
            if (!ev.action.isKey())
                return;
            // The panel writes the target and the name as ordinary settings; this is
            // where they become a rename. Storing them per-key as well keeps the
            // controls populated when the panel is reopened.
            const target = ev.payload.settings.renameTarget?.trim() ?? "";
            const previous = this.targets.get(ev.action.id);
            // Switching device loads that device's own name — empty for one that
            // hasn't been renamed. Without this the text left in the box from the last
            // device would be applied to the new one the moment anything else changed,
            // quietly renaming a device the user only meant to look at.
            if (target !== previous) {
                this.targets.set(ev.action.id, target);
                const existing = target ? (renames()[target] ?? "") : "";
                if ((ev.payload.settings.renameValue ?? "") !== existing) {
                    await ev.action.setSettings({ ...ev.payload.settings, renameValue: existing });
                }
                await this.draw(ev.action, ev.payload.settings);
                return;
            }
            if (target) {
                const current = renames()[target] ?? "";
                const next = ev.payload.settings.renameValue ?? "";
                if (next.trim() !== current) {
                    await setRename(target, next);
                    await this.sendDevices();
                }
            }
            await this.draw(ev.action, ev.payload.settings);
        }
        async onSendToPlugin(ev) {
            if (ev.payload?.event === "getDevices") {
                await this.sendDevices(ev.payload?.isRefresh === true);
                return;
            }
            if (ev.payload?.event === "clearRenames") {
                for (const key of Object.keys(renames()))
                    await setRename(key, "");
                await this.sendDevices();
                streamDeck.logger.info("device-renaming: cleared every name");
            }
        }
        /**
         * Feeds the picker. Entries show the name in force and, when it isn't the
         * device's own, what it's called underneath — otherwise a renamed device is
         * impossible to find again in a list of names you invented.
         */
        async sendDevices(force = false) {
            const devices = await discovery.list(force);
            const map = renames();
            const items = devices.map((device) => {
                const renamed = map[device.key];
                return {
                    label: renamed ? `${renamed}  (was ${device.label})` : device.label,
                    value: device.key,
                };
            });
            if (items.length === 0)
                items.push({ label: "No devices detected", value: "" });
            await replyToPanel({ event: "getDevices", items, renames: map });
        }
        async draw(action, settings) {
            const devices = withRenames(await discovery.list());
            const count = Object.keys(renames()).length;
            await action.setImage(renameKeyImage(count, devices.length, faceColors(settings)));
        }
    });
    return _classThis;
})();

/**
 * One key for a deskful of devices: whichever has least charge left.
 *
 * The single-device action answers "how is this headset doing"; this one
 * answers "is anything about to die on me", which is the question you actually
 * have when five keys each show a healthy number. It reads nothing itself —
 * discovery has already collected every device's level, so this is a choice
 * made over readings that exist, not extra work on the devices.
 */
let LowestBatteryAction = (() => {
    let _classDecorators = [action({ UUID: "com.emilberglund.batterymonitor.lowest-battery" })];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    let _classSuper = KeyFaceAction;
    (class extends _classSuper {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(_classSuper[Symbol.metadata] ?? null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        /** Picks the emptiest device from the scan discovery already did. */
        async read(_action, settings, force) {
            const devices = withRenames(await discovery.list(force));
            const lowest = pickLowest(devices, settings);
            if (!lowest) {
                return {
                    settings,
                    kind: "other",
                    reading: {
                        deviceLabel: "No devices",
                        percent: null,
                        status: "not-found",
                        detail: "Nothing detected can report a battery level",
                    },
                };
            }
            return { settings, reading: lowest.reading, kind: lowest.device.kind };
        }
        /**
         * The name is the point here: a number without the device it belongs to tells
         * you something is low but not what to go and charge.
         */
        present(_action, settings, live, kind) {
            const showName = resolved(settings).showName;
            return { reading: live, kind, name: showName ? live.deviceLabel : "", lowest: true };
        }
        /** A changed filter needs the list looked at again; a colour edit doesn't. */
        async needsReread() {
            return true;
        }
        /** The scope filter is this action's own; everything else comes from the base. */
        freshDefaults() {
            return { watch: DEFAULTS.watch };
        }
        async onSendToPlugin(ev) {
            if (ev.payload?.event === "getStatus") {
                const drawn = this.keys.get(ev.action.id)?.drawn;
                await replyToPanel({
                    event: "getStatus",
                    status: drawn
                        ? {
                            label: drawn.reading.deviceLabel,
                            percent: drawn.reading.percent,
                            state: drawn.reading.status === "charging" ? "Charging — lowest of the lot" : "Lowest right now",
                            tone: drawn.reading.percent === null ? "offline" : "ok",
                        }
                        : null,
                });
                return;
            }
            // getApps and shareAppearance are answered identically by both battery
            // actions, so they're handled once in the base class.
            await super.onSendToPlugin(ev);
        }
    });
    return _classThis;
})();
/**
 * The device with least charge, among those the key is set to watch.
 *
 * Only live levels count. A device that's off would otherwise win every time
 * with its last known level, and a mains-powered one has nothing to compare.
 */
function pickLowest(devices, settings) {
    const scope = resolved(settings).watch;
    let best;
    for (const device of devices) {
        const reading = device.reading;
        if (!reading || reading.percent === null)
            continue;
        if (reading.status !== "ok" && reading.status !== "charging")
            continue;
        if (!watchIncludes(scope, device.kind))
            continue;
        if (!best || reading.percent < best.reading.percent)
            best = { device, reading };
    }
    return best;
}

streamDeck.logger.setLevel("info");
setLogger(streamDeck.logger);
const batteryStatus = new BatteryStatusAction();
const lowestBattery = new LowestBatteryAction();
const deviceRenaming = new DeviceRenamingAction();
streamDeck.actions.registerAction(batteryStatus);
streamDeck.actions.registerAction(lowestBattery);
streamDeck.actions.registerAction(deviceRenaming);
// "Apply to all keys" writes the look to global settings; this is the single
// place that spreads it, so both action types adopt it the same way.
streamDeck.settings.onDidReceiveGlobalSettings((ev) => {
    // Renames live here too, and every label resolution reads them from cache.
    cacheRenames(ev.settings?.renames);
    const appearance = ev.settings?.appearance;
    if (!appearance)
        return;
    Promise.all([batteryStatus.applyShared(appearance), lowestBattery.applyShared(appearance)]).catch((err) => streamDeck.logger.error("plugin: applying the shared appearance failed", err));
});
// Only after connecting: getGlobalSettings is a request to Stream Deck, and
// issuing one before the socket exists leaves every later request queued behind
// it — which showed up as every key's poll timing out, not as an error here.
streamDeck
    .connect()
    .then(async () => {
    await loadRenames(true);
    streamDeck.logger.info("plugin: connected, renames loaded");
})
    // Without this a failure here is an unhandled rejection: the plugin keeps
    // running with no renames loaded and nothing said so.
    .catch((err) => streamDeck.logger.error("plugin: connecting failed", err));
