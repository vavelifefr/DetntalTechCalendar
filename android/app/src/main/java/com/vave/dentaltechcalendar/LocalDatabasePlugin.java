package com.vave.dentaltechcalendar;

import android.database.Cursor;
import android.util.Base64;

import androidx.annotation.NonNull;
import androidx.room.support.RoomSupportSQLite;
import androidx.sqlite.db.SupportSQLiteDatabase;
import androidx.sqlite.db.SupportSQLiteStatement;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "LocalDatabase")
public class LocalDatabasePlugin extends Plugin {
    private final ExecutorService databaseExecutor = Executors.newSingleThreadExecutor(runnable -> {
        Thread thread = new Thread(runnable, "dental-tech-sqlite");
        thread.setDaemon(true);
        return thread;
    });
    private volatile DentalTechRoomDatabase roomDatabase;

    @PluginMethod
    public void initialize(PluginCall call) {
        dispatch(call, database -> {
            int version = 0;
            try (Cursor cursor = database.query("SELECT COALESCE(MAX(version), 0) FROM schema_migrations")) {
                if (cursor.moveToFirst()) version = cursor.getInt(0);
            }
            JSObject result = new JSObject();
            result.put("schemaVersion", version);
            return result;
        });
    }

    @PluginMethod
    public void query(PluginCall call) {
        dispatch(call, database -> {
            String sql = requiredSql(call);
            Object[] arguments = arguments(call.getArray("args"));
            return queryRows(database, sql, arguments);
        });
    }

    @PluginMethod
    public void execute(PluginCall call) {
        dispatch(call, database -> {
            return executeStatement(database, requiredSql(call), arguments(call.getArray("args")));
        });
    }

    @PluginMethod
    public void transaction(PluginCall call) {
        dispatch(call, database -> {
            JSArray steps = call.getArray("steps");
            if (steps == null) throw new IllegalArgumentException("Transaction steps are required");

            List<JSObject> results = new ArrayList<>();
            database.beginTransaction();
            try {
                for (int index = 0; index < steps.length(); index++) {
                    JSONObject step = steps.getJSONObject(index);
                    String kind = step.optString("kind");
                    String sql = step.optString("sql");
                    if (sql.trim().isEmpty()) throw new IllegalArgumentException("Transaction SQL is required");
                    Object[] args = arguments(step.optJSONArray("args"));

                    if ("query".equals(kind)) {
                        results.add(queryRows(database, sql, args));
                    } else if ("execute".equals(kind)) {
                        results.add(executeStatement(database, sql, args));
                    } else {
                        throw new IllegalArgumentException("Transaction step kind must be query or execute");
                    }
                }
                database.setTransactionSuccessful();
            } finally {
                database.endTransaction();
            }

            JSObject result = new JSObject();
            JSArray array = new JSArray();
            for (JSObject item : results) append(array, item);
            result.put("results", array);
            return result;
        });
    }

    private void dispatch(PluginCall call, DatabaseOperation operation) {
        databaseExecutor.execute(() -> {
            try {
                call.resolve(operation.run(getDatabase()));
            } catch (Exception error) {
                call.reject(error.getMessage() == null ? "Local SQLite operation failed" : error.getMessage());
            }
        });
    }

    private SupportSQLiteDatabase getDatabase() {
        DentalTechRoomDatabase current = roomDatabase;
        if (current == null) {
            synchronized (this) {
                current = roomDatabase;
                if (current == null) {
                    current = DentalTechRoomDatabase.open(getContext());
                    roomDatabase = current;
                }
            }
        }
        SupportSQLiteDatabase database = RoomSupportSQLite.getSupportWrapper(current);
        if (database.isExecPerConnectionSQLSupported()) {
            database.execPerConnectionSQL("PRAGMA foreign_keys = ON", new Object[0]);
        } else {
            database.setForeignKeyConstraintsEnabled(true);
        }
        return database;
    }

    private static JSObject queryRows(SupportSQLiteDatabase database, String sql, Object[] arguments) {
        JSArray rows = new JSArray();
        try (Cursor cursor = database.query(sql, arguments)) {
            while (cursor.moveToNext()) {
                JSObject row = new JSObject();
                for (int column = 0; column < cursor.getColumnCount(); column++) {
                    row.put(cursor.getColumnName(column), cursorValue(cursor, column));
                }
                append(rows, row);
            }
        }
        JSObject result = new JSObject();
        result.put("rows", rows);
        return result;
    }

    private static JSObject executeStatement(SupportSQLiteDatabase database, String sql, Object[] arguments) throws Exception {
        SupportSQLiteStatement statement = database.compileStatement(sql);
        try {
            for (int index = 0; index < arguments.length; index++) {
                bind(statement, index + 1, arguments[index]);
            }

            String normalizedSql = sql.trim().toUpperCase(java.util.Locale.ROOT);
            int changes = 0;
            long lastInsertRowId = 0;
            if (normalizedSql.startsWith("INSERT") || normalizedSql.startsWith("REPLACE")) {
                lastInsertRowId = statement.executeInsert();
                changes = lastInsertRowId < 0 ? 0 : 1;
            } else if (normalizedSql.startsWith("UPDATE") || normalizedSql.startsWith("DELETE")) {
                changes = statement.executeUpdateDelete();
            } else {
                statement.execute();
            }

            JSObject result = new JSObject();
            result.put("changes", changes);
            result.put("lastInsertRowId", lastInsertRowId);
            return result;
        } finally {
            statement.close();
        }
    }

    private static void bind(SupportSQLiteStatement statement, int index, Object value) {
        if (value == null || value == JSONObject.NULL) {
            statement.bindNull(index);
        } else if (value instanceof String) {
            statement.bindString(index, (String) value);
        } else if (value instanceof Long || value instanceof Integer) {
            statement.bindLong(index, ((Number) value).longValue());
        } else if (value instanceof Double || value instanceof Float) {
            statement.bindDouble(index, ((Number) value).doubleValue());
        } else if (value instanceof byte[]) {
            statement.bindBlob(index, (byte[]) value);
        } else {
            throw new IllegalArgumentException("SQLite arguments must be scalar values");
        }
    }

    private static Object cursorValue(Cursor cursor, int index) {
        switch (cursor.getType(index)) {
            case Cursor.FIELD_TYPE_INTEGER:
                return cursor.getLong(index);
            case Cursor.FIELD_TYPE_FLOAT:
                return cursor.getDouble(index);
            case Cursor.FIELD_TYPE_STRING:
                return cursor.getString(index);
            case Cursor.FIELD_TYPE_BLOB:
                return Base64.encodeToString(cursor.getBlob(index), Base64.NO_WRAP);
            default:
                return JSONObject.NULL;
        }
    }

    private static Object[] arguments(JSONArray values) throws JSONException {
        if (values == null) return new Object[0];
        Object[] arguments = new Object[values.length()];
        for (int index = 0; index < values.length(); index++) {
            Object value = values.get(index);
            if (value == JSONObject.NULL) {
                arguments[index] = null;
            } else if (value instanceof Boolean) {
                arguments[index] = (Boolean) value ? 1 : 0;
            } else if (value instanceof Integer) {
                arguments[index] = ((Integer) value).longValue();
            } else if (value instanceof Long || value instanceof Double || value instanceof String || value instanceof byte[]) {
                arguments[index] = value;
            } else if (value instanceof Number) {
                arguments[index] = ((Number) value).doubleValue();
            } else {
                throw new IllegalArgumentException("SQLite arguments must be scalar values");
            }
        }
        return arguments;
    }

    private static String requiredSql(PluginCall call) {
        String sql = call.getString("sql");
        if (sql == null || sql.trim().isEmpty()) throw new IllegalArgumentException("SQL is required");
        return sql;
    }

    private static void append(JSArray array, Object value) {
        array.put(value);
    }

    @FunctionalInterface
    private interface DatabaseOperation {
        JSObject run(@NonNull SupportSQLiteDatabase database) throws Exception;
    }
}
