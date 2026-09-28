package com.vave.dentaltechcalendar;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.migration.Migration;
import androidx.sqlite.SQLite;
import androidx.sqlite.SQLiteConnection;
import androidx.sqlite.driver.bundled.BundledSQLiteDriver;

import java.util.ArrayList;
import java.util.List;

@Database(entities = {RoomMetadata.class}, version = 10, exportSchema = false)
public abstract class DentalTechRoomDatabase extends RoomDatabase {
    public static final String DATABASE_NAME = "dental-tech-calendar.sqlite";
    private static final int PRODUCT_SCHEMA_VERSION = 10;

    public static DentalTechRoomDatabase open(Context context) {
        Context applicationContext = context.getApplicationContext();
        return Room.databaseBuilder(applicationContext, DentalTechRoomDatabase.class, DATABASE_NAME)
                .setDriver(new BundledSQLiteDriver())
                .addMigrations(migrations(applicationContext))
                .addCallback(new Callback() {
                    @Override
                    public void onOpen(@NonNull SQLiteConnection connection) {
                        SQLite.execSQL(connection, "PRAGMA foreign_keys = ON");
                    }

                    @Override
                    public void onCreate(@NonNull SQLiteConnection connection) {
                        MigrationScriptRunner.createFreshSchema(applicationContext, connection, PRODUCT_SCHEMA_VERSION);
                    }
                })
                .build();
    }

    private static Migration[] migrations(Context context) {
        List<Migration> migrations = new ArrayList<>();
        for (int targetVersion = 1; targetVersion <= PRODUCT_SCHEMA_VERSION; targetVersion++) {
            final int migrationVersion = targetVersion;
            migrations.add(new Migration(targetVersion - 1, targetVersion) {
                @Override
                public void migrate(@NonNull SQLiteConnection database) {
                    MigrationScriptRunner.applyVersion(context, database, migrationVersion);
                }
            });
        }
        return migrations.toArray(new Migration[0]);
    }
}
