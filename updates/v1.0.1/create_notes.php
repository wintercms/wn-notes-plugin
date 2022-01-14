<?php namespace Winter\Notes\Updates;

use Schema;
use Winter\Storm\Database\Updates\Migration;

class CreateNotes extends Migration
{
    public function up()
    {
        Schema::create('winter_notes_notes', function ($table) {
            $table->increments('id')->unsigned();
            $table->string('target_type')->nullable();
            $table->integer('target_id')->nullable()->unsigned()->index();
            $table->string('name')->index();
            $table->mediumText('content')->nullable();
            $table->mediumText('additional_data')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->timestamp('deleted_at')->nullable();
        });
    }

    public function down()
    {
        Schema::dropIfExists('winter_notes_notes');
    }
}
