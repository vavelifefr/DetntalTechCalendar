package com.vave.dentaltechcalendar;

import androidx.annotation.NonNull;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/** Room-owned marker table; product schema remains defined by shared SQL migrations. */
@Entity(tableName = "room_metadata")
public class RoomMetadata {
    @PrimaryKey
    public int id = 1;

    @NonNull
    public String schemaOwner = "dental-tech-calendar";
}
