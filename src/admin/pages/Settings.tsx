import { useEffect, useState, type FormEvent } from 'react';
import { getStoreSettings, saveStoreSettings } from '../services/adminApi';
import type { StoreSettings } from '../services/adminApi';
import './Settings.css';

const fields: Array<{ key: keyof StoreSettings; label: string; type?: string; help?: string }> = [
    { key: 'store_name', label: 'Nombre de la tienda' },
    { key: 'store_description', label: 'Descripción de la tienda', help: 'Texto opcional que se muestra en la tienda pública.' },
    { key: 'whatsapp_number', label: 'WhatsApp del negocio', help: 'Celular colombiano de 10 dígitos. El indicativo +57 se agrega automáticamente.' },
    { key: 'contact_email', label: 'Correo de contacto', type: 'email' },
    { key: 'contact_phone', label: 'Teléfono comercial' },
    { key: 'instagram_url', label: 'Instagram', type: 'url' },
    { key: 'tiktok_url', label: 'TikTok', type: 'url' },
    { key: 'shipping_info', label: 'Información de envíos' },
    { key: 'returns_info', label: 'Información de cambios y devoluciones' },
];

const colombianPhoneFields: Array<keyof StoreSettings> = ['whatsapp_number', 'contact_phone'];
const localPhone = (value?: string) => {
    const digits = (value || '').replace(/\D/g, '');
    return digits.startsWith('57') && digits.length === 12 ? digits.slice(2) : digits.slice(0, 10);
};
const formSettings = (value: StoreSettings): StoreSettings => {
    // The API may return legacy keys that no longer have an editable field
    // (for example, store_location). Keep only the current form fields so an
    // old setting cannot make the entire save request fail validation.
    const currentFields = Object.fromEntries(fields.map(({ key }) => [key, value[key] || ''])) as StoreSettings;
    return {
        ...currentFields,
        whatsapp_number: localPhone(value.whatsapp_number),
        contact_phone: localPhone(value.contact_phone),
    };
};

export default function Settings() {
    const [settings, setSettings] = useState<StoreSettings>({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let active = true;
        const timer = window.setTimeout(() => {
            void getStoreSettings().then(data => { if (active) setSettings(formSettings(data)); })
                .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'No fue posible cargar la configuración.'); })
                .finally(() => { if (active) setLoading(false); });
        }, 0);
        return () => { active = false; window.clearTimeout(timer); };
    }, []);

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setSaving(true); setError(''); setSuccess('');
        try {
            await saveStoreSettings({
                ...settings,
                whatsapp_number: settings.whatsapp_number ? `57${localPhone(settings.whatsapp_number)}` : '',
                contact_phone: settings.contact_phone ? `57${localPhone(settings.contact_phone)}` : '',
            });
            const saved = await getStoreSettings();
            setSettings(formSettings(saved));
            setSuccess('Configuración guardada y verificada.');
        }
        catch (err) { setError(err instanceof Error ? err.message : 'No fue posible guardar la configuración.'); }
        finally { setSaving(false); }
    }

    return <main className="settings-page">
        <header className="settings-header"><span>FerCastillo® — CONTROL CENTER</span><h1>Configuración<span>.</span></h1><p>Administra los datos comerciales que la tienda utiliza.</p></header>
        {error && <div className="settings-message error" role="alert">{error}</div>}{success && <div className="settings-message success" role="status">{success}</div>}
        {loading ? <div className="settings-panel">Cargando configuración...</div> : <form className="settings-panel" onSubmit={event => void handleSubmit(event)}>
            {fields.map(field => <label className="settings-field" key={field.key}>{field.label}
                {field.key === 'shipping_info' || field.key === 'returns_info' || field.key === 'store_description'
                    ? <textarea rows={4} maxLength={field.key === 'store_description' ? 500 : 1000} value={settings[field.key] || ''} onChange={event => setSettings({ ...settings, [field.key]: event.target.value })} />
                    : colombianPhoneFields.includes(field.key)
                        ? <div className="settings-phone"><span>+57</span><input type="tel" inputMode="numeric" maxLength={10} placeholder="3001234567" value={localPhone(settings[field.key])} onChange={event => setSettings({ ...settings, [field.key]: event.target.value.replace(/\D/g, '').slice(0, 10) })} /></div>
                        : <input type={field.type || 'text'} maxLength={field.key === 'store_name' ? 80 : field.key === 'contact_email' ? 254 : 300} value={settings[field.key] || ''} onChange={event => setSettings({ ...settings, [field.key]: event.target.value })} />}
                {field.help && <small>{field.help}</small>}
            </label>)}
            <footer><button className="settings-save" disabled={saving}>{saving ? 'Guardando...' : 'Guardar configuración'}</button></footer>
        </form>}
    </main>;
}
