# Migration Secrets — أضف هذه الـ Secrets في المشروع الجديد

افتح **Secrets** في المشروع الجديد وأضف القيم التالية.
احصل على القيم الحالية من المشروع القديم عبر لوحة **Secrets**.

| Secret Key | الوصف |
|---|---|
| `JWT_SECRET` | مفتاح تشفير JWT — أبقِ نفس القيمة لصلاحية الجلسات |
| `SESSION_SECRET` | مفتاح جلسات Express — أبقِ نفس القيمة |
| `STEAM_API_KEY` | مفتاح Steam API |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | يُضاف تلقائياً عند تفعيل App Storage |
| `PRIVATE_OBJECT_DIR` | يُضاف تلقائياً عند تفعيل App Storage |
| `PUBLIC_OBJECT_SEARCH_PATHS` | يُضاف تلقائياً عند تفعيل App Storage |

> ⚠️ لا تنسَ تفعيل **App Storage** في المشروع الجديد قبل تشغيل سكريبت الاستيراد.

---

## Resend Integration
أعد ربط **Resend** من قسم Integrations في المشروع الجديد.
