import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

interface SecretValidationDialogOptions {
    parent: Gtk.Window;
    title: string;
    instructions: string;
    placeholder: string;
    help?: Gtk.Widget;
    cancellable: Gio.Cancellable;
    /** Return a message to keep the dialog open, or undefined on success. */
    validate: (value: string, cancellable: Gio.Cancellable, setStatus: (message: string) => void) => Promise<string | undefined>;
}

export function promptForValidatedSecret({
    parent, title, instructions, placeholder, help, cancellable, validate,
}: SecretValidationDialogOptions): Promise<boolean> {
    const dialog = Adw.MessageDialog.new(parent, title, instructions);
    dialog.modal = true;
    dialog.destroy_with_parent = true;
    const input = new Gtk.PasswordEntry({ placeholder_text: placeholder });
    const warning = new Gtk.Box({ spacing: 8, visible: false });
    const warningIcon = new Gtk.Image({
        icon_name: 'dialog-warning-symbolic',
        valign: Gtk.Align.START,
        css_classes: ['warning'],
    });
    const warningText = new Gtk.Label({ xalign: 0, wrap: true, max_width_chars: 34 });
    warning.append(warningIcon);
    warning.append(warningText);

    const showWarning = (message: string) => {
        dialog.body = instructions;
        warningText.label = message;
        warning.visible = true;
    };

    const cancelButton = new Gtk.Button({ label: 'Cancel' });
    const validateButton = new Gtk.Button({ label: 'Validate' });
    validateButton.add_css_class('suggested-action');
    // MessageDialog response buttons close the window automatically.
    const actions = new Gtk.Box({ spacing: 12, homogeneous: true, margin_top: 8 });
    actions.append(cancelButton);
    actions.append(validateButton);

    const fields = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 4 });
    fields.append(input);
    fields.append(warning);
    if (help)
        fields.append(help);
    fields.append(actions);
    dialog.extra_child = fields;
    dialog.set_default_widget(validateButton);

    return new Promise(resolve => {
        let request: Gio.Cancellable | undefined;
        let closed = false;

        const close = () => {
            closed = true;
            input.text = '';
            dialog.destroy();
        };
        const cancel = () => {
            if (closed)
                return;
            close();
            if (request)
                request.cancel();
            else
                resolve(false);
        };
        dialog.connect('close-request', () => {
            cancel();
            return true;
        });

        const submit = async (value: string, attempt: Gio.Cancellable) => {
            const parentCancel = cancellable.connect(() => attempt.cancel());
            let failure: string | undefined;
            try {
                failure = await validate(value, attempt, message => {
                    if (!closed && !attempt.is_cancelled())
                        dialog.body = message;
                });
            } catch {
                failure = 'Validation failed. Try again.';
            } finally {
                if (parentCancel)
                    cancellable.disconnect(parentCancel);
                request = undefined;
            }

            if (closed || cancellable.is_cancelled()) {
                resolve(false);
            } else if (failure !== undefined) {
                showWarning(failure);
                input.sensitive = true;
                validateButton.sensitive = true;
            } else {
                close();
                resolve(true);
            }
        };

        cancelButton.connect('clicked', cancel);
        validateButton.connect('clicked', () => {
            if (request || closed)
                return;
            request = new Gio.Cancellable();
            input.sensitive = false;
            validateButton.sensitive = false;
            warning.visible = false;
            void submit(input.text, request);
        });
        input.connect('activate', () => validateButton.activate());
        dialog.present();
        input.grab_focus();
    });
}
