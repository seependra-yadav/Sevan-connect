package com.sevan.connect;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.provider.CallLog;
import android.provider.ContactsContract;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.provider.Telephony;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(
    name = "PhoneData",
    permissions = {
        @Permission(alias = "contacts", strings = { Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS }),
        @Permission(alias = "calls", strings = { Manifest.permission.READ_CALL_LOG })
    }
)
public class PhoneDataPlugin extends Plugin {
    private static final int MAX_RECORDS = 150;
    private static final int MAX_FILES = 8;
    private static final int MAX_SMALL_FILE_BYTES = 40_000;
    private static final int MAX_PHOTOS = 3;
    private static final String PREFS = "sevan_phone_data";
    private static final String FOLDER_URI = "shared_folder_uri";
    private static final String PHOTO_URIS = "shared_photo_uris";

    @PluginMethod
    public void requestAndRead(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        aliases.add("contacts");
        aliases.add("sms");
        aliases.add("calls");
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsFinished");
    }

    @PermissionCallback
    private void permissionsFinished(PluginCall call) {
        call.resolve(readSnapshot());
    }

    @PluginMethod
    public void readGrantedData(PluginCall call) {
        call.resolve(readSnapshot());
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        startActivityForResult(call, intent, "notificationSettingsReturned");
    }

    @ActivityCallback
    private void notificationSettingsReturned(PluginCall call, ActivityResult result) {
        call.resolve(readSnapshot());
    }

    @PluginMethod
    public void chooseFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "folderSelected");
    }

    @ActivityCallback
    private void folderSelected(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        Uri uri = data == null ? null : data.getData();
        if (result.getResultCode() == android.app.Activity.RESULT_OK && uri != null) {
            try {
                getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
                preferences().edit().putString(FOLDER_URI, uri.toString()).apply();
            } catch (SecurityException error) {
                call.reject("Android did not grant access to the selected folder.");
                return;
            }
        }
        call.resolve(readSnapshot());
    }

    @PluginMethod
    public void choosePhotos(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.setType("image/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        startActivityForResult(call, intent, "photosSelected");
    }

    @ActivityCallback
    private void photosSelected(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == android.app.Activity.RESULT_OK && result.getData() != null) {
            Intent data = result.getData();
            JSONArray saved = new JSONArray();
            if (data.getClipData() != null) {
                for (int i = 0; i < Math.min(data.getClipData().getItemCount(), MAX_PHOTOS); i++) {
                    addPersistedPhoto(data.getClipData().getItemAt(i).getUri(), saved);
                }
            } else if (data.getData() != null) {
                addPersistedPhoto(data.getData(), saved);
            }
            preferences().edit().putString(PHOTO_URIS, saved.toString()).apply();
        }
        call.resolve(readSnapshot());
    }

    private void addPersistedPhoto(Uri uri, JSONArray saved) {
        try {
            getContext().getContentResolver().takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            saved.put(uri.toString());
        } catch (Exception ignored) {
            // Providers that do not support persistent grants remain usable in this app session.
            saved.put(uri.toString());
        }
    }

    @PluginMethod
    public void clearSelections(PluginCall call) {
        SharedPreferences prefs = preferences();
        String folder = prefs.getString(FOLDER_URI, null);
        releaseUri(folder);
        try {
            JSONArray photos = new JSONArray(prefs.getString(PHOTO_URIS, "[]"));
            for (int i = 0; i < photos.length(); i++) releaseUri(photos.optString(i));
        } catch (Exception ignored) {}
        prefs.edit().remove(FOLDER_URI).remove(PHOTO_URIS).apply();
        call.resolve(new JSObject());
    }

    private void releaseUri(String value) {
        if (value == null) return;
        try {
            getContext().getContentResolver().releasePersistableUriPermission(Uri.parse(value), Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception ignored) {}
    }

    private SharedPreferences preferences() {
        return getContext().getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE);
    }

    private JSObject readSnapshot() {
        JSObject result = new JSObject();
        result.put("contacts", readContacts());
        result.put("messages", readMessages());
        result.put("calls", readCalls());
        result.put("notifications", SevanNotificationListenerService.readActiveNotifications());
        result.put("files", readSharedFolder());
        result.put("photos", readSelectedPhotos());
        JSArray access = new JSArray();
        access.put(accessStatus("contacts", hasAndroidPermission(Manifest.permission.READ_CONTACTS), "Contacts"));
        access.put(accessStatus("messages", hasAndroidPermission(Manifest.permission.READ_SMS), "SMS"));
        access.put(accessStatus("calls", hasAndroidPermission(Manifest.permission.READ_CALL_LOG), "Call log"));
        access.put(accessStatus("photos", hasPhotoAccess(), "Photos"));
        access.put(accessStatus("notifications", SevanNotificationListenerService.isEnabled(getContext()), "Notifications"));
        access.put(accessStatus("files", preferences().contains(FOLDER_URI), "Files (selected folder)"));
        result.put("access", access);
        result.put("updatedAt", System.currentTimeMillis());
        return result;
    }

    private JSObject accessStatus(String category, boolean granted, String label) {
        JSObject row = new JSObject();
        row.put("category", category);
        row.put("status", granted ? "allowed" : "not_allowed");
        row.put("message", label + (granted ? " access allowed" : " access not allowed"));
        return row;
    }

    private boolean hasAndroidPermission(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasPhotoAccess() {
        try {
            return new JSONArray(preferences().getString(PHOTO_URIS, "[]")).length() > 0;
        } catch (Exception ignored) {
            return false;
        }
    }

    private JSArray readContacts() {
        JSArray rows = new JSArray();
        if (!hasPermission(Manifest.permission.READ_CONTACTS)) return rows;
        String[] columns = { ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME, ContactsContract.CommonDataKinds.Phone.NUMBER };
        try (Cursor cursor = getContext().getContentResolver().query(
            ContactsContract.CommonDataKinds.Phone.CONTENT_URI, columns, null, null,
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME + " ASC LIMIT " + MAX_RECORDS
        )) {
            if (cursor == null) return rows;
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("name", cursor.getString(0));
                row.put("phone", cursor.getString(1));
                rows.put(row);
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private JSArray readMessages() {
        JSArray rows = new JSArray();
        if (!hasPermission(Manifest.permission.READ_SMS)) return rows;
        String[] columns = { Telephony.Sms.ADDRESS, Telephony.Sms.BODY, Telephony.Sms.DATE, Telephony.Sms.TYPE };
        try (Cursor cursor = getContext().getContentResolver().query(Telephony.Sms.CONTENT_URI, columns, null, null, Telephony.Sms.DATE + " DESC LIMIT " + MAX_RECORDS)) {
            if (cursor == null) return rows;
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("address", cursor.getString(0));
                row.put("body", cursor.getString(1));
                row.put("date", cursor.getLong(2));
                row.put("type", cursor.getInt(3));
                rows.put(row);
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private JSArray readCalls() {
        JSArray rows = new JSArray();
        if (!hasPermission(Manifest.permission.READ_CALL_LOG)) return rows;
        String[] columns = { CallLog.Calls.CACHED_NAME, CallLog.Calls.NUMBER, CallLog.Calls.DATE, CallLog.Calls.DURATION, CallLog.Calls.TYPE };
        try (Cursor cursor = getContext().getContentResolver().query(CallLog.Calls.CONTENT_URI, columns, null, null, CallLog.Calls.DATE + " DESC LIMIT " + MAX_RECORDS)) {
            if (cursor == null) return rows;
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                row.put("name", cursor.getString(0));
                row.put("number", cursor.getString(1));
                row.put("date", cursor.getLong(2));
                row.put("duration", cursor.getLong(3));
                row.put("type", cursor.getInt(4));
                rows.put(row);
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private JSArray readSelectedPhotos() {
        JSArray rows = new JSArray();
        try {
            JSONArray uris = new JSONArray(preferences().getString(PHOTO_URIS, "[]"));
            for (int i = 0; i < Math.min(uris.length(), MAX_PHOTOS); i++) {
                JSObject row = readPickedUri(Uri.parse(uris.getString(i)), true);
                if (row != null) rows.put(row);
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private JSArray readSharedFolder() {
        JSArray rows = new JSArray();
        String value = preferences().getString(FOLDER_URI, null);
        if (value == null) return rows;
        Uri tree = Uri.parse(value);
        try {
            String rootId = DocumentsContract.getTreeDocumentId(tree);
            Uri children = DocumentsContract.buildChildDocumentsUriUsingTree(tree, rootId);
            String[] columns = { DocumentsContract.Document.COLUMN_DOCUMENT_ID, DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                DocumentsContract.Document.COLUMN_MIME_TYPE, DocumentsContract.Document.COLUMN_SIZE };
            try (Cursor cursor = getContext().getContentResolver().query(children, columns, null, null, null)) {
                if (cursor == null) return rows;
                while (cursor.moveToNext() && rows.length() < MAX_FILES) {
                    String id = cursor.getString(0);
                    Uri fileUri = DocumentsContract.buildDocumentUriUsingTree(tree, id);
                    JSObject row = readPickedUri(fileUri, false);
                    if (row != null) rows.put(row);
                }
            }
        } catch (Exception ignored) {}
        return rows;
    }

    private JSObject readPickedUri(Uri uri, boolean photo) {
        ContentResolver resolver = getContext().getContentResolver();
        JSObject row = new JSObject();
        try {
            String mime = resolver.getType(uri);
            String name = uri.getLastPathSegment();
            long size = -1;
            try (Cursor cursor = resolver.query(uri, new String[] { "_display_name", "_size" }, null, null, null)) {
                if (cursor != null && cursor.moveToFirst()) {
                    name = cursor.getString(0);
                    size = cursor.getLong(1);
                }
            }
            row.put("name", name == null ? "Selected file" : name);
            row.put("mimeType", photo ? "image/jpeg" : (mime == null ? "application/octet-stream" : mime));
            if (size >= 0) row.put("size", size);
            byte[] bytes = photo ? readPhotoPreview(uri) : readSmallContent(uri, MAX_SMALL_FILE_BYTES);
            if (bytes != null && bytes.length > 0) {
                row.put("dataUrl", "data:" + (photo ? "image/jpeg" : (mime == null ? "application/octet-stream" : mime)) + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
            }
            return row;
        } catch (Exception ignored) {
            return null;
        }
    }

    private byte[] readPhotoPreview(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            BitmapFactory.decodeStream(input, null, bounds);
        }
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null;
        int sample = 1;
        while (bounds.outWidth / sample > 640 || bounds.outHeight / sample > 640) sample *= 2;
        BitmapFactory.Options options = new BitmapFactory.Options();
        options.inSampleSize = sample;
        Bitmap bitmap;
        try (InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) return null;
            bitmap = BitmapFactory.decodeStream(input, null, options);
        }
        if (bitmap == null) return null;
        int quality = 74;
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
        while (output.size() > 90_000 && quality > 42) {
            quality -= 10;
            output.reset();
            bitmap.compress(Bitmap.CompressFormat.JPEG, quality, output);
        }
        bitmap.recycle();
        return output.toByteArray();
    }

    private byte[] readSmallContent(Uri uri, int maxBytes) throws Exception {
        try (InputStream input = getContext().getContentResolver().openInputStream(uri);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            if (input == null) return null;
            byte[] buffer = new byte[8192];
            int total = 0;
            int read;
            while ((read = input.read(buffer)) != -1) {
                total += read;
                if (total > maxBytes) return null;
                output.write(buffer, 0, read);
            }
            return output.toByteArray();
        }
    }
}
