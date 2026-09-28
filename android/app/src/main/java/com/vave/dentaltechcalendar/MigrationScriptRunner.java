package com.vave.dentaltechcalendar;

import android.content.Context;
import android.content.res.AssetManager;

import androidx.sqlite.SQLite;
import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.SQLiteStatement;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class MigrationScriptRunner {
    private MigrationScriptRunner() {}

    static void createFreshSchema(Context context, SQLiteConnection database, int targetVersion) {
        SQLite.execSQL(database, "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)");
        for (int version = 1; version <= targetVersion; version++) {
            applyVersion(context, database, version);
        }
    }

    static void applyVersion(Context context, SQLiteConnection database, int version) {
        SQLite.execSQL(database, "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE)");
        String filename = migrationFilename(context.getAssets(), version);
        String name = filename.substring(0, filename.length() - 4);

        try (SQLiteStatement statement = database.prepare("SELECT name FROM schema_migrations WHERE version = ?")) {
            statement.bindLong(1, version);
            if (statement.step()) {
                String installedName = statement.getText(0);
                if (!name.equals(installedName)) {
                    throw new IllegalStateException("SQLite migration " + version + " has an unexpected name");
                }
                return;
            }
        }

        String script = readAsset(context.getAssets(), filename);
        boolean startedTransaction = !database.inTransaction();
        if (startedTransaction) SQLite.execSQL(database, "BEGIN TRANSACTION");
        try {
            for (String statement : splitStatements(script)) {
                // Android Room owns SQLite user_version; the shared scripts retain it for the web driver.
                if (!statement.toUpperCase(Locale.ROOT).startsWith("PRAGMA USER_VERSION")) {
                    SQLite.execSQL(database, statement);
                }
            }
            SQLiteStatement insert = database.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)");
            insert.bindLong(1, version);
            insert.bindText(2, name);
            insert.step();
            insert.close();
            if (startedTransaction) SQLite.execSQL(database, "COMMIT");
        } catch (RuntimeException error) {
            if (startedTransaction) SQLite.execSQL(database, "ROLLBACK");
            throw error;
        }
    }

    private static String migrationFilename(AssetManager assets, int version) {
        String prefix = String.format(Locale.ROOT, "%03d-", version);
        try {
            for (String filename : assets.list("")) {
                if (filename.startsWith(prefix) && filename.endsWith(".sql")) return filename;
            }
        } catch (IOException error) {
            throw new IllegalStateException("Cannot list SQLite migration assets", error);
        }
        throw new IllegalStateException("Missing SQLite migration asset " + prefix);
    }

    private static String readAsset(AssetManager assets, String filename) {
        try (InputStream input = assets.open(filename);
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096];
            int bytesRead;
            while ((bytesRead = input.read(buffer)) != -1) output.write(buffer, 0, bytesRead);
            return output.toString(StandardCharsets.UTF_8.name());
        } catch (IOException error) {
            throw new IllegalStateException("Cannot read SQLite migration " + filename, error);
        }
    }

    private static List<String> splitStatements(String script) {
        List<String> statements = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        boolean singleQuoted = false;
        boolean doubleQuoted = false;
        boolean backtickQuoted = false;
        boolean lineComment = false;
        boolean blockComment = false;

        for (int index = 0; index < script.length(); index++) {
            char value = script.charAt(index);
            char next = index + 1 < script.length() ? script.charAt(index + 1) : '\0';

            if (lineComment) {
                if (value == '\n' || value == '\r') {
                    lineComment = false;
                    current.append(value);
                }
                continue;
            }
            if (blockComment) {
                if (value == '*' && next == '/') {
                    blockComment = false;
                    index++;
                }
                continue;
            }
            if (!singleQuoted && !doubleQuoted && !backtickQuoted && value == '-' && next == '-') {
                lineComment = true;
                index++;
                continue;
            }
            if (!singleQuoted && !doubleQuoted && !backtickQuoted && value == '/' && next == '*') {
                blockComment = true;
                index++;
                continue;
            }

            if (!doubleQuoted && !backtickQuoted && value == '\'' && (index == 0 || script.charAt(index - 1) != '\\')) {
                if (singleQuoted && next == '\'') {
                    current.append(value).append(next);
                    index++;
                    continue;
                }
                singleQuoted = !singleQuoted;
            } else if (!singleQuoted && !backtickQuoted && value == '"') {
                doubleQuoted = !doubleQuoted;
            } else if (!singleQuoted && !doubleQuoted && value == '`') {
                backtickQuoted = !backtickQuoted;
            }

            if (value == ';' && !singleQuoted && !doubleQuoted && !backtickQuoted) {
                appendStatement(statements, current);
            } else {
                current.append(value);
            }
        }
        appendStatement(statements, current);
        return statements;
    }

    private static void appendStatement(List<String> statements, StringBuilder current) {
        String statement = current.toString().trim();
        if (!statement.isEmpty()) statements.add(statement);
        current.setLength(0);
    }
}
