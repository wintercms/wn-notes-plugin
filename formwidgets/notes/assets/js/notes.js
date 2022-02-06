/*
 * Field Notes plugin
 *
 * Data attributes:
 * - data-control="fieldnotes" - enables the plugin on an element
 * - data-option="value" - an option with a value
 *
 * JavaScript API:
 * $('a#someElement').fieldNotes({...})
 */
+function ($) {
    "use strict";
    var Base = $.wn.foundation.base,
        BaseProto = Base.prototype

    // FIELD REPEATER CLASS DEFINITION
    // ============================

    var Notes = function (element, options) {
        this.options = options

        this.$el = $(element)

        this.$createNewNoteButton = this.$el.find('> .row > .toolbar  [data-note-add]');
        this.$removeNoteButton = this.$el.find('> .row > .toolbar  [data-note-remove]');

        this.$richEditorTextarea = null;
        this.$notification = this.$el.find('> .row > .field-notes-form  .field-notes-notification');
        this.$savingTimeout = null;
        this.$notificationTimeout = null;
        this.$isSaving = false;

        this.$loadContainer = this.$el.find('> .row > .field-notes-form .loading-indicator-container:first');

        // To avoid saving twice, when user using the command to saving
        this.$lastSavingNoteData = {
            id: 0,
            name: '',
            content: '',
        }

        this.$oldHotkeyElements = [];

        $.wn.foundation.controlUtils.markDisposable(element)
        Base.call(this)
        this.init()
    }

    Notes.prototype = Object.create(BaseProto)
    Notes.prototype.constructor = Notes

    Notes.DEFAULTS = {
        alias: null,
        autosaveDelay: 2000,
        previewMode: false,
    }

    Notes.prototype.initRichEditor = function () {
        //Because the richeditor will refresh
        this.disposeRichEditor();
        this.$richEditorTextarea = this.$el.find('> .row > .field-notes-form  textarea:first');
        if (this.$richEditorTextarea == null || this.$richEditorTextarea.length == 0) return;
        if (!this.options.previewMode) {
            this.$richEditorTextarea.on('froalaEditor.contentChanged', this.proxy(this.onAutoSavingNote));
            this.$richEditorTextarea.on('keydown.oc.richeditor', this.proxy(this.stopDelaySaving));
        }
    }
    Notes.prototype.disposeRichEditor = function () {
        if (this.$richEditorTextarea == null || this.$richEditorTextarea.length == 0) return;
        if (!this.options.previewMode) {
            this.$richEditorTextarea.off('froalaEditor.contentChanged', this.proxy(this.onAutoSavingNote) );
            this.$richEditorTextarea.off('keydown.oc.richeditor', this.proxy(this.stopDelaySaving));
            this.$richEditorTextarea  = null;
        }
    }

    Notes.prototype.init = function () {

        this.$el.on('click', '> .row > .field-notes-list > .field-notes-items > .field-notes-item > a', this.proxy(this.onClickNoteItem));
        this.$el.on('click', '> .row > .toolbar  [data-note-add]', this.proxy(this.clickCreateButton));
        this.$el.on('click', '> .row > .toolbar  [data-note-remove]', this.proxy(this.clickDeleteButton));

        //Before the search bar will change the notes list, need to save the current not first
        this.$el.on('focus', '> .row > .toolbar .loading-indicator-container [data-track-input]', this.proxy(this.onSearchInputFocus));
        this.$el.on('ajaxDone', '> .row > .toolbar  .loading-indicator-container [data-track-input]', this.proxy(this.onSearchResultsRefreshForm));
        this.$el.on('focus', '> .row > .toolbar .loading-indicator-container .clear-input-text', this.proxy(this.onSearchInputClearButtonFocus));

        this.$el.on('ajaxDone', '> .row > .toolbar  [data-note-remove]', this.proxy(this.onNoteRemoveSuccess));

        // For note auto saving
        // this.$el.on('change', '> .row > .field-notes-form  textarea:first', this.proxy(this.onAutoSavingNote));
        this.initRichEditor();
        this.$el.on('keyup', '> .row > .field-notes-form  input:first' , this.proxy(this.onAutoSavingNoteName) );
        this.$el.on('keydown', '> .row > .field-notes-form  input:first' , this.proxy(this.disableEnterSubmit) );
            /*
            * Hotkeys
            */
        // let hotkeyA = this.$el.find('> .row > .field-notes-form [data-notes-hotkey]');
        this.$el.hotKey({
            hotkey: 'ctrl+s, cmd+s',
            hotkeyVisible: false,
            callback: this.proxy(this.onCommandSaving)
        })

        let self = this;
        $(window).load(function(){
            // The first time loading, need to refresh the richeditor.
            // Because it is invoked by <?= $this->makePartial('note_content'); ?> in _notes.htm
            self.setLastSavingNoteData();
            self.bindingOldHotkeys();
            //Disable the create/delete button when there is only one 'new note' left
            self.resetRemoveNoteButtonEnable();
            self.resetCreateNewNoteButtonEnable();
        });

        this.$el.on('dispose-control', this.proxy(this.dispose))
    }

    Notes.prototype.dispose = function () {
        // this.$sortable.sortable('destroy')

        this.$el.off('click', '> .row > .field-notes-list > .field-notes-items > .field-notes-item > a', this.proxy(this.onClickNoteItem))
        this.$el.off('click', '> .row > .toolbar  [data-note-add]', this.proxy(this.clickCreateButton))
        this.$el.off('click', '> .row > .toolbar  [data-note-remove]', this.proxy(this.clickDeleteButton));

        this.$el.off('focus', '> .row > .toolbar .loading-indicator-container [data-track-input]', this.proxy(this.onSearchInputFocus));
        this.$el.off('ajaxDone', '> .row > .toolbar  .loading-indicator-container [data-track-input]', this.proxy(this.onSearchResultsRefreshForm));
        this.$el.off('focus', '> .row > .toolbar .loading-indicator-container .clear-input-text', this.proxy(this.onSearchInputClearButtonFocus));

        this.$el.off('ajaxDone', '> .row > .toolbar  [data-note-remove]', this.proxy(this.onNoteRemoveSuccess));


        this.disposeRichEditor();
        this.$el.off('keyup', '> .row > .field-notes-form  input:first' , this.proxy(this.onAutoSavingNoteName) );
        this.$el.off('keydown', '> .row > .field-notes-form  input:first' , this.proxy(this.disableEnterSubmit) );

        this.unbindOldHotkeyElements();
        this.$el.hotKey('dispose');

        this.$el.off('dispose-control', this.proxy(this.dispose));
        this.$el.removeData('oc.notes');

        this.$el = null
        this.options = null

        BaseProto.dispose.call(this)
    }

    // Deprecated
    Notes.prototype.unbind = function () {
        this.dispose()
    }

    /**
     * Create a new default note when the note list is empty
     */
    Notes.prototype.createDefaultNote = function() {
        if (this.options.previewMode) {
            return;
        }
        const notesList = this.$el.find('> .row > .field-notes-list');
        if (notesList.find('> ul > li').length == 0) {
            this.createNewNote(false);
        }
    }

    Notes.prototype.onSearchInputFocus = function(ev) {
        if (this.$savingTimeout == null ) return true;
        const target = ev.target;
        target.blur();
        this.finishSavingProcess(function(){
            const $target = $(target);
            const val = $target.val();
            $target.val('');
            $target.val(val);
            $target.focus();
        });
        return false;
    }
    Notes.prototype.onSearchInputClearButtonFocus = function(ev){
        if (this.$savingTimeout == null ) return true;
        const target = ev.target;
        target.blur();
        target.disabled = true;
        this.finishSavingProcess(function(){
            target.focus();
            target.disabled = false;
        }, function(){
            target.disabled = false;
        });
        return false;
    }

    /**
     * To remove the ctrl+s and command+s in the hotKeyString
     * @returns string "" or "ctrl+a"
     * @param hotkey hotkey @see input.hotkey.js
     */
    Notes.prototype.removeConflictHotKeys = function(hotkey) {
        let result = [];
        const keys = hotkey.options.hotkey.toLowerCase().split(',');
        for (var i = 0, len = keys.length; i < len; i++) {
            let keysTrimmed = hotkey.trim(keys[i]);
            if (keysTrimmed != 'ctrl+s'
                && keysTrimmed != 'cmd+s'
                && keysTrimmed != 'command+s'
                && keysTrimmed != 'meta+s') {
                    result.push(keysTrimmed);
            }
        }
        return result.join(',');
    }

    Notes.prototype.hasConflictHotKeys = function (hotkeyString, specialKey) {
        let checklist;
        if(specialKey == 'ctrl+s') {
            checklist = ['ctrl+s'];
        }else if(specialKey == 'cmd+s'){
            checklist = ['cmd+s', 'command+s', 'meta+s'];
        }else{
            checklist = ['ctrl+s', 'cmd+s', 'command+s', 'meta+s'];
        }
        let result = false;
        for(let checkKey of checklist){
            if (hotkeyString.includes(checkKey)){
                result = true;
                break;
            }
        }
        return result;
    }

    /**
     * There are three options:
     * 1. Button has same conflict hotkeys: ctrl+s,cmd+s --> can't reinit, just remove callback
     * 2. Button has only one hotkey: ctrl+s or cmd+s    --> can't reinit, just remove callback
     * 3. Button has one or two conflict hotkeys,
     *    but has other hotkeys: ctrl+s,cmd+p            --> reset the new Hotkeys, reinit the hotkey conroller
     *
     */
    Notes.prototype.bindingOldHotkeys = function() {
        if (this.options.previewMode) return;
        let $form = this.$el.closest('form');
        let self = this;
        $form.find('[data-hotkey]').each(function(index,elem)
        {
            elem = $(elem);
            if(elem != self.$el){
                let oldHotkeyString = elem.data('hotkey').toLowerCase();
                if ( self.hasConflictHotKeys(oldHotkeyString) ){
                    let hotkey = elem.data('oc.hotkey');
                    let newHotKeyString = self.removeConflictHotKeys(hotkey);
                    let oldCallback = hotkey.options.callback;
                    if(newHotKeyString){
                        // The button or a has other hotkeys
                        hotkey.options.hotkey = newHotKeyString;
                        hotkey.unregisterHandlers();
                        hotkey.init();
                    }else{
                        // can not init a new hotkey, because it is empty
                        hotkey.options.callback = null;
                    }
                    self.$oldHotkeyElements.push({
                        elem : elem,
                        callback: oldCallback,
                        newHotKeyString: newHotKeyString,
                        oldHotKeyString: oldHotkeyString
                    });
                }
            }
        });

    }

    Notes.prototype.unbindOldHotkeyElements = function() {
        if (this.options.previewMode) return;
        for (let item of this.$oldHotkeyElements){
            let elem = item.elem;
            let hotkey = elem.data('oc.hotkey');
            let oldCallback = item.callback;
            if (item.newHotKeyString){
                // reinit the hotkey with the old hotkey string
                hotkey.options.hotkey = item.oldHotKeyString;
                hotkey.unregisterHandlers();
                hotkey.init();
            }else{
                hotkey.options.callback = oldCallback;
            }

        }
        this.$oldHotkeyElements.length = 0;
    }

    Notes.prototype.testNoteOnFocus = function() {
        const focusElem = document.activeElement;
        const nameInput = this.$el.find('> .row > .field-notes-form  input:first');
        if (nameInput[0] == focusElem) {
            return true;
        }

        //control-richeditor
        let div = focusElem.parentElement;
        if(div) { div = div.parentElement; }

        return div && $(div).hasClass('control-richeditor')
    }

    Notes.prototype.onCommandSaving = function (element, target, ev) {

        // Do not need to test conditions;
        if (this.testNoteOnFocus()) {
            this.stopDelaySaving();
            if (this.testSelectedNote()) {
                this.showNotification(langNotes.saving + ' ...', false );
                this.postNoteData();
            }
            return false;
        }

        // call the old binding callback, such as Save button
        for (let item of this.$oldHotkeyElements){
            let key = ev.originalEvent.ctrlKey ? 'ctl+s' : 'cmd+s';
            // Maybe the button or a only binding with ctrl+s or cmd+s
            if (this.hasConflictHotKeys(item.oldHotKeyString , key)){
                let elem = item.elem;
                let hotkey = elem.data('oc.hotkey');

                let oldCallback = item.callback;
                if (oldCallback &&  ! (hotkey.options.hotkeyVisible && !hotkey.$el.is(':visible')) ){
                    oldCallback(elem, target, ev);
                }
            }
        }
        return false;


    }
    /**
     * To remove the checked style of the Note List
     */
    Notes.prototype.clearNoteListCheckedStyle = function () {
        this.$el.find('> .row > .field-notes-list > .field-notes-items > .field-notes-item > a').removeClass('checked');
    }

    /**
     * request the current selected note by note id
     * update the note form
     * @param jQueryObject item li
     * @param bool activeNameFiled If activeNameFiled set true, it will auto set focus on the Name field
     */
    Notes.prototype.fetchSelectedNote = function(item , activeNameFiled = true){
        const aItem = item.find('a');
        const self = this;
        this.$loadContainer.loadIndicator();
        aItem.request(this.makeEventHandler('onNoteActive'), {
            success: function(data, textStatus, jqXHR){
                // To do the default success function
                this.success(data, textStatus, jqXHR);
                //rebinding the editor event
                self.initRichEditor();
                self.setLastSavingNoteData(self.getNoteData());
                self.$loadContainer.loadIndicator('hide');

                if(activeNameFiled){
                    const nameInput = self.$el.find('> .row > .field-notes-form  input:first');
                    //Place the cursor at the end of the input text
                    const val = nameInput.val();
                    nameInput.val('');
                    nameInput.val(val);
                    nameInput.focus();
                }
            },
            error: function(jqXHR, textStatus, error){
                this.error(jqXHR, textStatus, error);
                self.$loadContainer.loadIndicator('hide');
            }
        });
    }

    Notes.prototype.onSearchResultsRefreshForm = function() {
        this.initRichEditor(); // need to bind the events
        this.setLastSavingNoteData(this.getNoteData());
        this.resetCreateNewNoteButtonEnable();
        this.resetRemoveNoteButtonEnable();
    }


    /**
     * This method should be called when the Note form refresh
     * Before active another note just like searching, creating and onClick, need to calls this first.
     */
    Notes.prototype.finishSavingProcess = function(onSuccessCallback = function(){},
                                                    onErrorCallback = function(){}){
        if (this.$savingTimeout == null ) {
            onSuccessCallback();
            return true;
        }
        //Do it manualy
        this.stopDelaySaving();
        if (this.testSelectedNote() && this.testSavingConditions()) {
            this.showNotification(langNotes.saving + ' ...', false );
            this.postNoteData(onSuccessCallback,onErrorCallback);
            return false;
        }else{
            onSuccessCallback();
            return true;
        }
    }

    /**
     *
     * @param event ev  window.event
     * @param jQueryObject note the HTML a jQuery object
     */
    Notes.prototype.onClickNoteItem = function (ev , note) {
        const target = (ev) ? $(ev.currentTarget) : note;
        if (target.hasClass('checked')) {
            return;
        }
        const self = this;
        this.finishSavingProcess(function () {
            // modify the css sytle
            self.clearNoteListCheckedStyle();
            target.addClass('checked');
            self.fetchSelectedNote(target.parent());
        });
    }


    /**
     * HTML ul scroll to the li
     */
    Notes.prototype.notesListScrollToItem = function (item) {
        this.$el.find('> .row > .field-notes-list > .field-notes-items').animate({
            scrollTop: item.position().top
        }, 'slow');
    }

    /**
     * Make Event Handler, same as PHP $this->getEventHandler('xxx')
     */
    Notes.prototype.makeEventHandler = function (methodName) {
        return this.options.alias + "::" + methodName ;
    }

    Notes.prototype.clickCreateButton = function (ev) {
        ev.preventDefault();
        this.createNewNote();
    }

    Notes.prototype.setCreateNewNoteButtonEnable = function(enable) {
        this.$createNewNoteButton.prop('disabled', !enable);
        var title = enable ? langNotes.addNew : langNotes.finishSaving;
        this.$createNewNoteButton.attr('title', title);
    }

    Notes.prototype.setRemoveNoteButtonEnable = function (enable) {
        this.$removeNoteButton.prop('disabled', !enable);
        var title = enable ? langNotes.delete : langNotes.mustExist;
        this.$removeNoteButton.attr('title', title);
    }

    Notes.prototype.getFirstNoteItem = function() {
        return this.$el.find('> .row > .field-notes-list > .field-notes-items li:first-child');
    }

    Notes.prototype.resetCreateNewNoteButtonEnable = function () {
        const firstNoteItem = this.getFirstNoteItem();
        if (firstNoteItem.length >0 && firstNoteItem[0].hasAttribute('data-note-unsaved') && firstNoteItem.next().length === 0) {
            this.setCreateNewNoteButtonEnable(false);
        }else{
            this.setCreateNewNoteButtonEnable(true);
        }
    }
    /**
     * disable: When only new unsaved note exists in the list
     */
    Notes.prototype.resetRemoveNoteButtonEnable = function(firstNoteItem = null) {
        firstNoteItem = firstNoteItem || this.getFirstNoteItem();
        if (firstNoteItem.length == 0  || (firstNoteItem[0].hasAttribute('data-note-unsaved') && firstNoteItem.next().length === 0)) {
            this.setRemoveNoteButtonEnable(false);
        } else {
            this.setRemoveNoteButtonEnable(true);
        }
    }

    Notes.prototype.createNewNote = function(activeNameField = true) {

        this.setCreateNewNoteButtonEnable(false);
        const self = this;

        this.finishSavingProcess(function(){
            let currentTime = new Date().toLocaleTimeString();
            self.clearNoteListCheckedStyle();

            self.$el.find('> .row > .field-notes-list > .field-notes-items').prepend('<li data-note-unsaved class="fade field-notes-item"><a href="javascript:;"   data-request-data="id:0" class="checked"><div><h3>' + langNotes.new + '</h3><h4>' + currentTime + '<span></span></h4></div></a></li>');
            let newNote = self.$el.find('> .row > .field-notes-list > .field-notes-items li:first-child');
            self.fetchSelectedNote(newNote, activeNameField);
            self.notesListScrollToItem(newNote);
            self.resetRemoveNoteButtonEnable(newNote);
            setTimeout(function () {
                newNote.addClass(' show');
            }, 10);
        });
    }


    /**
     *
     * @param string name  It can be shown in a message when catch some errors
     * @param string value  eg: id:1, id:7
     */
    Notes.prototype.paramToObj = function (name, value) {
        if (value === undefined) value = ''
        if (typeof value == 'object') return value

        try {
            let data = JSON.parse(JSON.stringify(eval("({" + value + "})")))
            return data;
        }
        catch (e) {
            throw new Error('Error parsing the '+name+' attribute value. '+e)
        }
    }

    Notes.prototype.clickDeleteButton = function (ev) {

        let target = $(ev.target);
        let noteData = this.getSelectedNoteIdData();
        if (noteData){
            target.data('request-data', noteData);
            //Do not need to save anything
            this.stopDelaySaving();
            $(target).request( this.makeEventHandler('onNoteDelete'));
        }
        // To prevent the form submit, because it is a button inside the form
        ev.preventDefault();
    }

    Notes.prototype.onNoteRemoveSuccess = function () {
        let checkedItem = this.getCheckedItem();
        $(checkedItem).parent().remove();

        let firstNote = this.$el.find('> .row > .field-notes-list > .field-notes-items li:first-child');
        this.resetRemoveNoteButtonEnable(firstNote);
        if (firstNote.length > 0) {
            this.notesListScrollToItem(firstNote);
            this.onClickNoteItem(null, firstNote.find('a'));
            //Check unsaved note
            if (!firstNote[0].hasAttribute('data-note-unsaved')){
                this.setCreateNewNoteButtonEnable(true);
            }
        }else{
            //No note in the list now
            this.setLastSavingNoteData({
                id:0,
                name:'',
                content:''
            });
            this.clearNoteForm();
            this.createDefaultNote();

        }
        $.wn.flashMsg({
            text: langNotes.hasDeleted,
            'class': 'success',
            'interval': 2
        });

    }

    /**
     * Update the Checked Item in the title list
     * @param array data  {"id":1, "name":"Note Name", "updated_at": "2018-12-14 10:01:00" }
     * @param {*} textStatus
     * @param {*} jqXHR
     */
    Notes.prototype.onNoteSaveSuccess = function (data, textStatus, jqXHR) {
        // HTML a
        let checkedItem = this.getCheckedItem();
        if (checkedItem) {
            checkedItem.find('h3').text(data['name']);
            checkedItem.find('h4').html(data['updated_at'] + ' <span>' + data['abstract'] + '</span>');

            checkedItem.attr('data-request-data', 'id:' + data['id']);
            // Need to update the internal data same time.
            checkedItem.data('request-data', 'id:' + data['id']);
            let checkedli = checkedItem.parent();
            if (checkedli[0].hasAttribute('data-note-unsaved')) {
                checkedli.removeAttr('data-note-unsaved');
                this.setCreateNewNoteButtonEnable(true);
            }
            this.resetRemoveNoteButtonEnable();
        }

        this.hideNotification();
    }


    /**
     * @returns jQueryObject a jQueryObject
     */
    Notes.prototype.getCheckedItem = function () {
        return this.$el.find('> .row > .field-notes-list > .field-notes-items > .field-notes-item >  .checked');
    }

    /**
     * @returns string id:7 or null
     */
    Notes.prototype.getSelectedNoteIdData = function () {
        let checkedItem = this.getCheckedItem();
        return (checkedItem.length>0) ? $(checkedItem).data('request-data') : null;
    }


    /**
     * After delete the last note, need to clear name and content.
     */
    Notes.prototype.clearNoteForm = function(){
        let richeditorElem = this.$el.find('> .row > .field-notes-form  [data-control="richeditor"]');
        let richedior = richeditorElem.data('oc.richEditor');
        richedior.setContent('');
        this.$el.find('> .row > .field-notes-form  input:first').val('');

    }

    /**
     * The default Note title/name should be the valid first line of the content
     * when the name field is empty
     */
    Notes.prototype.setDefaultNoteName = function() {
        const nameInput = this.$el.find('> .row > .field-notes-form  input:first');
        if (nameInput.val().trim().length > 0) return;

        const htmlView = this.$richEditorTextarea.parent().find('.fr-view');
        let content = htmlView[0].outerText.trim();
        if (content.length === 0) return;

        const lines = content.split(/\r|\n/);
        let firstLine = '';
        for (let i=0, len=lines.length; i < len; i++) {
            firstLine = lines[i].trim();
            if( firstLine.length > 0 ) break;
        }
        if (firstLine.length > 20) firstLine = firstLine.substring(0,20);
        nameInput.val(firstLine);
    }

    Notes.prototype.getActiveNoteID = function() {
        let noteIDData = this.getSelectedNoteIdData(); // id:10
        return (noteIDData) ? noteIDData.split(':')[1] : 0;
    }

    Notes.prototype.getNoteData = function(){
        let name = this.$el.find('> .row > .field-notes-form input:first').val();
        let content = this.$richEditorTextarea.val();
        return {
            id: this.getActiveNoteID(),
            name: name,
            content: content
        }
    }

    Notes.prototype.postNoteData = function(onSuccessCallback = function(){}, onErrorCallback = function(){}){
        this.$isSaving  = true;
        // Get the note formdata
        let $form = this.$el.closest('form');
        let noteData = {
            id: this.getActiveNoteID(),
            _session_key: $form.find('[name="_session_key"]').val(),
            _token: $form.find('[name="_token"]').val()
        };
        this.$el.find('.field-notes-form [name]').each(function (i) {
            let $this = $(this);
            noteData[$this.attr('name')] = $this.val();
        });

        let self = this;
        $.request(this.makeEventHandler('onSaveNote'),{
            data: noteData,
            success: function(data, textStatus, jqXHR){
                self.onNoteSaveSuccess(data, textStatus, jqXHR);
                self.showNotification(langNotes.hasSaved, true, 500);
                self.setLastSavingNoteData();
                self.$isSaving = false;
                onSuccessCallback();
            },
            error: function(jqXHR, textStatus, error){
                this.error(jqXHR, textStatus, error);
                self.$isSaving = false;
                self.hideNotification();
                onErrorCallback();
            }
        });
    }

    Notes.prototype.setLastSavingNoteData = function(postNoteData){
        postNoteData = postNoteData || this.getNoteData();
        this.$lastSavingNoteData.id = postNoteData.id;
        this.$lastSavingNoteData.name = postNoteData.name;
        this.$lastSavingNoteData.content = postNoteData.content;
    }

    Notes.prototype.testSelectedNote = function(){
        let val =  this.getSelectedNoteIdData() != null;
        return val;
    }

    Notes.prototype.testSavingConditions = function(){
        if (this.$isSaving || this.options.previewMode){
            return false;
        }
        let noteData = this.getNoteData();
        if (
            this.$lastSavingNoteData.id == noteData.id
            && this.$lastSavingNoteData.name == noteData.name
            && this.$lastSavingNoteData.content == noteData.content
        ){
            return false;
        }
        return true;
    }

    Notes.prototype.onAutoSavingNote = function(ev){
        this.stopDelaySaving();
        this.setDefaultNoteName();
        const self = this;
        // create a new timer;
        this.$savingTimeout = setTimeout(function() {
            if (self.testSelectedNote() && self.testSavingConditions()) {
                self.showNotification(langNotes.saving + ' ...', false );
                self.postNoteData();
            }
        }, this.options.autosaveDelay);
    }


    Notes.prototype.onAutoSavingNoteName = function(ev){
        ev.preventDefault();

        let target = $(ev.target);
        let noteName = target.val();
        if (noteName == ''){
            this.setDefaultNoteName();
        }
        this.onAutoSavingNote(ev);
    }

    Notes.prototype.disableEnterSubmit = function(ev){
        if (ev.keyCode == 13 || ev.which == 13) {
            ev.preventDefault();
            return ev;
        }
    }

    /**
     * Binding the keyDown event in richeditor.
     */
    Notes.prototype.stopDelaySaving = function(){
        if (this.$savingTimeout) {
            clearTimeout(this.$savingTimeout);
            this.$savingTimeout = null;
            this.hideNotification();
        }
    }

    /**
     * @param string message
     * @param string messageStyle error or info
     * @param bool autoClose
     * @param int time The amount of time, in milliseconds, to show the message animation.
     */
    Notes.prototype.showNotification = function(message, autoClose = true , time = 3000 ) {
        this.$notification.find('.loading-indicator div').text(message);
        if(this.$notificationTimeout) clearTimeout(this.$notificationTimeout);
        this.$notification.show();
        if (autoClose){
            let self = this;
            this.$notificationTimeout = setTimeout(function(){
                self.$notification.hide();
            }, time);
        }
    }

    Notes.prototype.hideNotification = function () {
        this.$notification.hide();
    }




    // FIELD NOTES PLUGIN DEFINITION
    // ============================

    var old = $.fn.fieldNotes

    $.fn.fieldNotes = function (option) {
        var args = Array.prototype.slice.call(arguments, 1),
            result
        this.each(function () {
            var $this = $(this)
            var data = $this.data('oc.notes')
            var options = $.extend({}, Notes.DEFAULTS, $this.data(), typeof option == 'object' && option)
            if (!data) $this.data('oc.notes', (data = new Notes(this, options)))
            if (typeof option == 'string') result = data[option].apply(data, args)
            if (typeof result != 'undefined') return false
        })

        return result ? result : this
    }

    $.fn.fieldNotes.Constructor = Notes

    // FIELD NOTES NO CONFLICT
    // =================

    $.fn.fieldNotes.noConflict = function () {
        $.fn.fieldNotes = old
        return this
    }

    // FIELD NOTES DATA-API
    // ===============

    $(document).render(function () {
        $('[data-control="fieldnotes"]').fieldNotes()
    });

}(window.jQuery);