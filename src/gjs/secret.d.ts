declare module 'gi://Secret?version=1' {
    import type Gio from 'gi://Gio';
    type Attributes = Record<string, string>;
    type Callback = (source: unknown, result: Gio.AsyncResult) => void;

    class Schema {
        constructor(name: string, flags: number, attributes: Record<string, number>);
    }

    const Secret: {
        Schema: typeof Schema;
        SchemaFlags: { NONE: number };
        SchemaAttributeType: { STRING: number };
        COLLECTION_DEFAULT: string;
        password_lookup(schema: Schema, attributes: Attributes, cancellable: Gio.Cancellable, callback: Callback): void;
        password_lookup_finish(result: Gio.AsyncResult): string | null;
        password_store(schema: Schema, attributes: Attributes, collection: string, label: string, password: string,
            cancellable: Gio.Cancellable, callback: Callback): void;
        password_store_finish(result: Gio.AsyncResult): boolean;
        password_clear(schema: Schema, attributes: Attributes, cancellable: Gio.Cancellable, callback: Callback): void;
        password_clear_finish(result: Gio.AsyncResult): boolean;
    };
    export default Secret;
}
