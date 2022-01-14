<?php namespace Winter\Notes\FormWidgets;

use Response;
use Backend\Classes\FormField;
use Winter\Storm\Html\HtmlBuilder;
use Backend\Classes\FormWidgetBase;

use Winter\Notes\Models\Note;

/**
 * Notes Form Widget
 */
class Notes extends FormWidgetBase
{
    use \Backend\Traits\SearchableWidget;

    //
    // Configurable properties
    //

    /**
     * @var array Form field configuration
     */
    public $form = '$/winter/notes/models/note/fields.yaml';

    /**
     * @var string Field name to use for the title of collapsed items
     */
    public $nameFrom = 'name';

    /**
     * @var integer Delay after typing before triggering an auto save
     */
    public $autosaveDelay = 2000;

    /**
     *
     * @var string The note title updated_at column format
     */
    public $dateFormat = 'Y-m-d H:i:s';

    //
    // Internal properties
    //

    /**
     * @inheritDoc
     */
    protected $defaultAlias = 'winter_notes';

    /**
     * @var string The name of the relation being used
     */
    protected $relationName;

    /**
     * @var string If searching the records, specifies a policy to use.
     * - all: result must contain all words
     * - any: result can contain any word
     * - exact: result must contain the exact phrase
     */
    protected $searchMode;

    /**
     * @var string Use a custom scope method for performing searches.
     */
    protected $searchScope;

    /**
     * @var Backend\Widgets\Form The initialized Form widget for working with the note data; accessed by $this->getFormWidget();
     */
    protected $formWidget;

    /**
     * @var Backend\Widgets\Toolbar The toolbar widget for performing actions on the related notes
     */
    protected $toolbarWidget;

    /**
     * @var integer The currently active note ID
     */
    protected $activeNoteId = 0;

    /**
     * @inheritDoc
     */
    public function init()
    {
        // Populate configuration
        $this->fillFromConfig([
            'form',
            'nameFrom',
            'autosaveDelay',
            'dateFormat'
        ]);

        if ($this->formField->disabled || $this->formField->readOnly) {
            $this->previewMode = true;
        }

        // Get the relation name from the containing field's name
        $this->relationName = $this->formField->getName(false);

        // Get the active note ID if there is one
        if (!empty(post('id'))) {
            $this->activeNoteId = post('id');
        }

        // Initialize the toolbar widget
        $this->getToolbarWidget();
    }

    /**
     * Initialize the Form widget used by this FormWidget
     *
     * @return Backend\Widgets\Form The intialized Form widget
     */
    protected function getFormWidget()
    {
        if ($this->formWidget) {
            return $this->formWidget;
        }

        // Configure the Form widget
        $config = $this->makeConfig($this->form);
        $config->model = $this->getActiveNote();
        $config->arrayName = $this->getFieldName();
        $config->isNested = true;

        // Initialize the Form widget
        $this->formWidget = $this->makeWidget('Backend\Widgets\Form', $config);
        $this->formWidget->bindToController();
        $this->formWidget->previewMode = $this->previewMode;

        return $this->formWidget;
    }

    /**
     * Initialize the Toolbar widget used by this FormWidget
     *
     * @return Backend\Widgets\Toolbar The intialized Toolbar widget
     */
    protected function getToolbarWidget()
    {
        if ($this->toolbarWidget) {
            return $this->toolbarWidget;
        }

        // Configure the Toolbar widget
        $config = $this->makeConfig([
            'buttons' => '$/winter/notes/formwidgets/notes/partials/_notes_toolbar.htm',
            'search' => [
                'prompt' => 'backend::lang.list.search_prompt',
            ],
        ]);
        $config->alias = $this->alias . 'Toolbar';

        // Initialize the Toolbar widget
        $this->toolbarWidget = $this->makeWidget('Backend\Widgets\Toolbar', $config);
        $this->toolbarWidget->bindToController();
        $this->toolbarWidget->controller->addViewPath($this->viewPath);
        $this->toolbarWidget->cssClasses[] = 'list-header';
        $this->toolbarWidget->previewMode = $this->previewMode;

        /*
         * Link the Search Widget to the Notes Widget
         */
        if ($searchWidget = $this->toolbarWidget->getSearchWidget()) {
            $searchWidget->bindEvent('search.submit', function () use ($searchWidget) {
                $this->setSearchTerm($searchWidget->getActiveTerm());
                return $this->renderSearchingResult();
            });

            $this->setSearchOptions([
                'mode' => $searchWidget->mode,
                'scope' => $searchWidget->scope,
            ]);

            // Find predefined search term
            $this->setSearchTerm($searchWidget->getActiveTerm());
        }

        return $this->toolbarWidget;
    }

    /**
     * Applies search options to the notes search.
     * @param array $options
     */
    public function setSearchOptions($options = [])
    {
        extract(array_merge([
            'mode' => null,
            'scope' => null
        ], $options));

        $this->searchMode = $mode;
        $this->searchScope = $scope;
    }

    /**
     * Get the relationship object for this FormWidget
     *
     * @return MorphMany Relation reference for the Notes relationship
     */
    protected function getRelation()
    {
        return $this->model->{$this->relationName}();
    }

    /**
     * Get the active Note model to work with
     *
     * @return Note
     */
    protected function getActiveNote()
    {
        if ($this->activeNoteId > 0) {
            return $this->getRelation()->withDeferred($this->sessionKey)->findOrFail($this->activeNoteId);
        } else {
            $note = new Note([ 'name' => '', 'content' => '' ]);
            $note->id = 0;
            $note->updated_at = \Carbon\Carbon::now();
            return $note;
        }
    }

    /**
     * @inheritDoc
     */
    public function loadAssets()
    {
        $this->addCss(['less/notes.less'], 'Winter.Notes');
        $this->addJs('js/notes.js', 'Winter.Notes');
    }

    /**
     * Prepares the form widget view data
     */
    public function prepareVars()
    {
        if ($this->formField->disabled || $this->formField->readOnly) {
            $this->previewMode = true;
        }

        $this->vars['notesList'] = $this->loadNotesList();
        $this->vars['formWidget'] = $this->getFormWidget();
        $this->vars['toolbar'] = $this->getToolbarWidget();
    }

    /**
     * @inheritDoc
     */
    public function render()
    {
        $this->prepareVars();
        return $this->makePartial('notes');
    }

    /**
     * This widget does not return save data directly, it interfaces with
     * model relationships
     *
     * @param mixed $value The existing value for this widget.
     * @return string The new value for this widget.
     */
    public function getSaveValue($value)
    {
        return FormField::NO_SAVE_DATA;
    }

    /**
     * Refresh the notes list and the content sametime.
     * The first item is default selected
     *
     * @return array ['html_id'=> partial]
     */
    public function renderSearchingResult()
    {
        // that line is for notes_list PHP script
        $this->vars['notesList'] =  $this->loadNotesList();
        $notesList = [ '#'.$this->getId('notesList')  => $this->makePartial('notes_list') ];
        // Need to refresh the content same time
        return array_merge($notesList, $this->onNoteActive());
    }

    /**
     * Load this model's notes,
     * including name(title), id and updated_at
     *
     * @return array ["id"=> 1, "name"=>"TITLE", "updated_at"=> Carbon];
     */
    private function loadNotesList()
    {
        //By searching controller in Toolbar
        $key = $this->searchTerm;

        $query = $this->getRelation()->select('id', 'name', 'content', 'updated_at')->orderby('updated_at', 'desc');

        //searching
        if(!empty($key)){
            $query->where(function($q) use($key){
                $q->where('name', 'like', "%$key%")->orWhere('content', 'like', "%$key%");
            });
        }

        $noteModelList = $query->get();
        if ( empty($key) && $noteModelList->count() === 0 && !$this->previewMode ){
            $noteModelList = [$this->getFormWidget()->model];
        }

        $result = [];
        foreach ($noteModelList as  $noteModel) {
            $result[] = [
                'id' => $noteModel->id,
                'name' => $noteModel->name,
                'abstract' => $this->getContentAbstract($noteModel->content, $noteModel->name),
                'updated_at' => $noteModel->updated_at->format($this->dateFormat),
            ];
        }
        if (count($result) > 0 && empty($this->activeNoteId)) {
            // the first item is selected by default
            $this->activeNoteId = $result[0]['id'];
        }
        return $result;
    }

    /**
     * It will be called from the partials/_notes.htm this->getEventHandler('onNoteActive')
     *
     * @return array AJAX update for the note_content partial and the active ID
     */
    public function onNoteActive()
    {
        $this->vars['formWidget'] = $this->getFormWidget();
        return [
            '#' . $this->getId('content') => $this->makePartial('note_content'),
            'id' => $this->activeNoteId,
        ];
    }

    /**
     * Delete the active note
     */
    public function onNoteDelete()
    {
        $note = $this->getActiveNote();
        $note->delete();
    }

    private function getContentAbstract($content = '', $name = '')
    {
        $plainText = HtmlBuilder::strip($content);
        $lines = preg_split('/$\R?^/m', $plainText);

        $abstract = '';
        foreach ($lines as $line) {
            $line = trim(str_replace("&nbsp;", '', $line));
            if ($line !== "\t" && $line !== $name) {
                $len = strlen($line);
                if ($len > 0) {
                    $abstract = $len == 15 ? $line :  str_limit($line, 12, '...');
                    break;
                }
            }
        }
        return $abstract;
    }

    public function onSaveNote()
    {
        // Get the active note
        $note = $this->getActiveNote();

        if (!$this->previewMode){
            $data = $this->getFormWidget()->getSaveData();
            // Update an existing note or create a new one
            if ($note->exists) {
                $note->fill($data);
                $note->save();
            } else {
                $note = $this->getRelation()->create($data, $this->sessionKey);
            }
        }

        // Update the note in the sidebar list
        return Response::json([
            'id'         => $note['id'] ,
            'name'       => $note['name'],
            'abstract'   => $this->getContentAbstract($note['content'], $note['name']),
            'updated_at' => $note['updated_at']->format($this->dateFormat),
        ]);
    }
}
