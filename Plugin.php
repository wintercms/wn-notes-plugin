<?php namespace Winter\Notes;

use System\Classes\PluginBase;

class Plugin extends PluginBase
{
    /**
     * Returns information about this plugin.
     *
     * @return array
     */
    public function pluginDetails()
    {
        return [
            'name'        => 'winter.notes::lang.plugin.name',
            'description' => 'winter.notes::lang.plugin.description',
            'author'      => 'Winter CMS',
            'icon'        => 'icon-file-text-o'
        ];
    }

    /**
     * Register the plugin's form widgets
     *
     * @return array
     */
    public function registerFormWidgets()
    {
        return [
            'Winter\Notes\FormWidgets\Notes' => 'notes',
        ];
    }
}
