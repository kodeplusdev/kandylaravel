//========================KANDY SETUP AND LISTENER CALLBACK ==============

var unassignedUser = "KANDY UNASSIGNED USER";
var chatMessageTimeStamp = 0;
var activeContainerId;
var sessionNames = {};

var USER_STATUS_OFFLINE = 0;
var USER_STATUS_ONLINE = 1;

// Create audio objects to play incoming calls and outgoing calls sound
var $audioRingIn = jQuery('<audio>', { loop: 'loop', id: 'ring-in' });
var $audioRingOut = jQuery('<audio>', { loop: 'loop', id: 'ring-out' });

// Load audio source to DOM to indicate call events
var audioSource = {
    ringIn: [
        { src: 'https://kandy-portal.s3.amazonaws.com/public/sounds/ringin.mp3', type: 'audio/mp3' },
        { src: 'https://kandy-portal.s3.amazonaws.com/public/sounds/ringin.ogg', type: 'audio/ogg' }
    ],
    ringOut: [
        { src: 'https://kandy-portal.s3.amazonaws.com/public/sounds/ringout.mp3', type: 'audio/mp3' },
        { src: 'https://kandy-portal.s3.amazonaws.com/public/sounds/ringout.ogg', type: 'audio/ogg' }
    ]
};

audioSource.ringIn.forEach(function (entry) {
    var $source = jQuery('<source>').attr('src', entry.src);
    $audioRingIn.append($source);
});

audioSource.ringOut.forEach(function (entry) {
    var $source = jQuery('<source>').attr('src', entry.src);
    $audioRingOut.append($source);
});


/**
 * Kandy Set up
 */
setup = function () {
    // initialize KandyAPI.Phone, passing a config JSON object that contains listeners (event callbacks)
    kandy.setup({
        // respond to Kandy events...
        remoteVideoContainer: $('#theirVideo')[0],
        localVideoContainer: $('#myVideo')[0],
        listeners: {
            callinitiated: kandy_on_call_initiate_callback,
            callincoming: kandy_incoming_call_callback,
            // when an outgoing call is connected
            oncall: kandy_on_call_callback,
            // when an incoming call is connected
            // you indicated that you are answering the call
            callanswered: kandy_call_answered_callback,
            callended: kandy_call_ended_callback,
            //callback when change presence status
            presencenotification: kandy_presence_notification_callback
        }
    });

    if($(".kandyChat").length){
        kandy.setup({
            listeners: {
                message: kandy_onMessage,
                chatGroupMessage: kandy_onGroupMessage,
                chatGroupInvite: kandy_onGroupInvite,
                chatGroupBoot: kandy_onRemovedFromGroup,
                chatGroupLeave: kandy_onLeaveGroup,
                chatGroupUpdate: '',
                chatGroupDelete: kandy_onTerminateGroup
            }
        })
    }

};

/**
 * Login Success Callback.
 */
kandy_login_success_callback = function () {
    console.log('login successful');
    KandyAPI.Phone.updatePresence(0);

    //have kandyAddressBook widget
    if ($(".kandyAddressBook").length) {
        kandy_loadContacts_addressBook();
    }
    //have kandyChat widget
    if ($(".kandyChat").length) {
        kandy_loadContacts_chat();
        kandy_loadGroups();
        setTimeout(updateUserGroupStatus,3000);

    }
    if($("#coBrowsing").length){
        kandy_getOpenSessionsByType("cobrowsing",loadSessionList);
    }

    //call user callback
    if (typeof login_success_callback == 'function') {
        login_success_callback();
    }

    kandy_updateUserStatus(USER_STATUS_ONLINE);

    //call user logout if exists
    if (typeof kandy_logout == 'function') {
        kandy_logout();
    }
};

/**
 * Login Fail Callback
 */
kandy_login_failed_callback = function () {
    if (typeof login_failed_callback == 'function') {
        login_failed_callback();
    }
};

/**
 * Status Notification Callback.
 *
 * @param userId
 * @param state
 * @param description
 * @param activity
 */
kandy_presence_notification_callback = function (userId, state, description, activity) {
    // HTML id can't contain @ and jquery doesn't like periods (in id)
    var id_attr = '.kandyAddressBook .kandyAddressContactList #presence_' + userId.replace(/[.@]/g, '_');
    $(id_attr).text(description);
    if (typeof presence_notification_callback == 'function') {
        presence_notification_callback(userId, state, description, activity);
    }
    //update chat status
    if($('.kandyChat').length >0){
        var liUser = $('.kandyChat .cd-tabs-navigation li#' +userId.replace(/[.@]/g, '_'));
        var statusItem = liUser.find('i.status');
        statusItem.text(description);

        liUser.removeClass().addClass('kandy-chat-status-' + description.replace(/ /g,'-').toLowerCase());
        liUser.attr('title', description);
    }
    usersStatus[userId] = description;
    updateUserGroupStatus();
};
/**
 * on call initiate callback
 * @param call
 */
kandy_on_call_initiate_callback = function(call){
    $('#'+activeContainerId).attr('data-call-id', call.getId());
    $audioRingIn[0].pause();
    $audioRingOut[0].play();
};

/**
 * OnCall Callback
 * @param call
 */
kandy_on_call_callback = function (call) {
    if (typeof on_call_callback == 'function') {
        on_call_callback(call);
    }

    $audioRingOut[0].pause();

    var target = $('.kandyButton[data-call-id="'+call.getId()+'"]');
    changeAnswerButtonState("ON_CALL",target);
};

/**
 * Incoming Callback.
 *
 * @param call
 * @param isAnonymous
 */
kandy_incoming_call_callback = function (call, isAnonymous) {
    if (typeof incoming_call_callback == 'function') {
        incoming_call_callback(call, isAnonymous);
    }

    $audioRingIn[0].play();

    var target = $('.kandyVideoButtonCallOut:visible').get(0).closest('.kandyButton');
    $(target).attr('data-call-id', call.getId());
    changeAnswerButtonState('BEING_CALLED', target);
};

/**
 * Kandy call answered callback.
 *
 * @param call
 * @param isAnonymous
 */
kandy_call_answered_callback = function (call, isAnonymous) {
    if (typeof call_answered_callback == 'function') {
        call_answered_callback(call, isAnonymous);
    }

    $audioRingOut[0].pause();
    $audioRingIn[0].pause();

    var target = $('.kandyButton[data-call-id="'+call.getId()+'"]');
    changeAnswerButtonState("ON_CALL", target);
};

kandy_call_answer_failed_callback = function (call){
    console.log('call answer failed', call);
}

/**
 * Kandy call ended callback.
 *
 */
kandy_call_ended_callback = function (call) {
    $audioRingOut[0].play();
    $audioRingIn[0].pause();

    if (typeof call_ended_callback == 'function') {
        call_ended_callback();
    }
    var target = $('.kandyButton[data-call-id="'+ call.getId() +'"]');
    changeAnswerButtonState("READY_FOR_CALLING",target);
};

/**
 * Change AnswerButtonState with KandyButton Widget.
 * @param target
 * @param state
 */
changeAnswerButtonState = function (state, target) {
    var kandyButton = (typeof target !== 'undefined')?$(target):$(".kandyButton");

    switch (state) {
        case 'READY_FOR_CALLING':
            $audioRingIn[0].pause();
            $audioRingOut[0].pause();
            kandyButton.find('.kandyVideoButtonSomeonesCalling').hide();
            kandyButton.find('.kandyVideoButtonCallOut').show();
            kandyButton.find('.kandyVideoButtonCalling').hide();
            kandyButton.find('.kandyVideoButtonOnCall').hide();
            break;

        case 'BEING_CALLED':
            kandyButton.find('.kandyVideoButtonSomeonesCalling').show();
            kandyButton.find('.kandyVideoButtonCallOut').hide();
            kandyButton.find('.kandyVideoButtonCalling').hide();
            kandyButton.find('.kandyVideoButtonOnCall').hide();
            break;

        case 'CALLING':
            kandyButton.find('.kandyVideoButtonSomeonesCalling').hide();
            kandyButton.find('.kandyVideoButtonCallOut').hide();
            kandyButton.find('.kandyVideoButtonCalling').show();
            kandyButton.find('.kandyVideoButtonOnCall').hide();
            break;
        case 'ON_CALL':
            kandyButton.find('.kandyVideoButtonSomeonesCalling').hide();
            kandyButton.find('.kandyVideoButtonCallOut').hide();
            kandyButton.find('.kandyVideoButtonCalling').hide();
            kandyButton.find('.kandyVideoButtonOnCall').show();
            break;
    }
};

/**
 * Event when answer a call.
 *
 * @param target
 */
kandy_answer_video_call = function (target) {
    var kandyButtonId = $(target).data('container');
    var currentCallId = $('div#'+kandyButtonId).attr('data-call-id');
    activeContainerId = kandyButtonId;
    KandyAPI.Phone.answerCall(currentCallId, true);
    if (typeof answer_video_call_callback == 'function') {
        answer_video_call_callback("ANSWERING_CALL");
    }
};

/*
 Event when click call button
 */
kandy_make_video_call = function (target) {
    var kandyButtonId = $(target).data('container');
    activeContainerId = kandyButtonId;

    KandyAPI.Phone.makeCall($('#'+kandyButtonId+' .kandyVideoButtonCallOut #callOutUserId').val(),true);
    changeAnswerButtonState("CALLING", '#'+ kandyButtonId);
    if (typeof make_video_call_callback == 'function') {
        make_video_call_callback(target);
    }
};

/*
 Event when answer a voice call
 */
kandy_answer_voice_call = function (target) {
    var kandyButtonId = $(target).data('container');
    var currentCallId = $('div#'+kandyButtonId).attr('data-call-id');
    activeContainerId = kandyButtonId;
    KandyAPI.Phone.answerCall(currentCallId, false);
    if (typeof answer_voice_call_callback == 'function') {
        answer_voice_call_callback(target);
    }

};

/*
 Event when click call button
 */
kandy_make_voice_call = function (target) {
    var kandyButtonId = $(target).data('container');
    activeContainerId = kandyButtonId;
    KandyAPI.Phone.makeCall($('#'+kandyButtonId+' .kandyVideoButtonCallOut #callOutUserId').val(),false);
    changeAnswerButtonState("CALLING", '#'+kandyButtonId);

    if (typeof make_voice_call_callback == 'function') {
        make_voice_call_callback(target);
    }
};

/*
 Event when click end call button
 */
kandy_end_call = function (target) {

    var kandyButtonId = $(target).data('container');
    var currentCallId = $('div#'+kandyButtonId).attr('data-call-id');

    KandyAPI.Phone.endCall(currentCallId);

    if (typeof end_call_callback == 'function') {
        end_call_callback(target);
    }

    changeAnswerButtonState("READY_FOR_CALLING", "#"+kandyButtonId);
};

/**
 * ADDRESS BOOK WIDGET
 */
/**
 * Load contact list for addressBook widget
 */
kandy_loadContacts_addressBook = function () {
    var contactListForPresence = [];
    var contactToRemove = [];
    kandy.addressbook.retrievePersonalAddressBook(
            function (results) {
                results = getDisplayNameForContact(results);
                // clear out the current address book list
                $(".kandyAddressBook .kandyAddressContactList div:not(:first)").remove();
                var div = null;
                if (results.length == 0) {
                    div = "<div class='kandyAddressBookNoResult'>-- No Contacts --</div>";
                    $('.kandyAddressBook .kandyAddressContactList').append(div);
                } else {
                    $('.kandyAddressBook .kandyAddressContactList').append("<div class='kandy-contact-heading'><span class='displayname'><b>Username</b></span><span class='userid'><b>Contact</b></span><span class='presence_'><b>Status</b></span></div>");

                    for (var i = 0; i < results.length; i++) {
                        var displayName = results[i].display_name;
                        var contactId = results[i].contact_id;

                        if (displayName == unassignedUser) {
                            contactToRemove.push(contactId);
                            continue;
                        }
                        contactListForPresence.push({full_user_id: results[i].contact_user_name});

                        var id_attr = results[i].contact_user_name.replace(/[.@]/g, '_');
                        $('.kandyAddressBook .kandyAddressContactList').append(
                                // HTML id can't contain @ and jquery doesn't like periods (in id)
                                "<div class='kandyContactItem' id='uid_" + results[i].contact_user_name.replace(/[.@]/g, '_') + "'>" +
                                "<span class='displayname'>" + displayName + "</span>" +
                                "<span class='userId'>" + results[i].contact_user_name + "</span>" +
                                "<span id='presence_" + id_attr + "' class='presence'></span>" +
                                "<input class='removeBtn' type='button' value='Remove' " +
                                " onclick='kandy_removeFromContacts(\"" + contactId + "\")'>" +
                                "</div>"
                        );
                    }
                    KandyAPI.Phone.watchPresence(contactListForPresence);
                    for (var i = 0; i < contactToRemove.length; i++) {
                        kandy_removeFromContacts(contactToRemove[i]);
                    }
                }
            },
            function () {
                console.log("Error kandy_loadContacts_addressBook");
            }
    );
};

/**
 * Change current user status with kandyAddressBook
 *
 * @param status
 */
kandy_my_status_changed = function (status) {
    KandyAPI.Phone.updatePresence(status);
};

/**
 * Add a user to contact list with kandyAddressBook
 * @type {null}
 */
var userIdToAddToContacts = null;  // need access to this in anonymous function below
kandy_addToContacts = function (userId) {
    userIdToAddToContacts = userId;

    // HTML id can't contain @ and jquery doesn't like periods (in id)
    if ($('#uid_' + userId.replace(/[.@]/g, '_')).length > 0) {
        alert("This person is already in your contact list.")
    } else {
        // get and AddressBook.Entry object for this contact
        kandy.addressbook.searchDirectoryByUserName(
                userId,
                function (results) {
                    for (var i = 0; i < results.length; ++i) {
                        if (results[i].full_user_id === userIdToAddToContacts) {
                            // user name and nickname are required
                            var contact = {
                                contact_user_name: results[i].full_user_id,
                                contact_nickname: results[i].full_user_id
                            };
                            if (results[i].user_first_name) {
                                contact['contact_first_name'] = results[i].user_first_name;
                            }
                            if (results[i].user_last_name) {
                                contact['contact_last_name'] = results[i].user_last_name;
                            }
                            if (results[i].user_phone_number) {
                                contact['contact_home_phone'] = results[i].user_phone_number;
                            }
                            if (results[i].user_email) {
                                contact['contact_email'] = results[i].user_email;
                            }

                            kandy.addressbook.addToPersonalAddressBook(
                                    contact,
                                    kandy_loadContacts_addressBook, // function to call on success
                                    function (message) {
                                        alert("Error: " + message);
                                    }
                            );
                            break;
                        }
                    }
                },
                function (statusCode) {
                    console.log("Error getting contact details: " + statusCode)
                }
        );
    }
};

/**
 * Remove a user from Contact List with kandyAddressBook
 * @param nickname
 */
kandy_removeFromContacts = function (nickname) {
    kandy.addressbook.removeFromPersonalAddressBook(nickname,kandy_loadContacts_addressBook,  // function to call on success
        function () {
            console.log('Error kandy_removeFromContacts ');
        }
    );
};

/**
 * Search contact list by username with kandyAddressBook
 */
kandy_searchDirectoryByUserName = function () {
    var userName = $('.kandyAddressBook .kandyDirectorySearch #kandySearchUserName').val();
    $.ajax({
        url: "/kandy/getUsersForSearch",
        data: {q:userName},
        headers: { 'X-CSRF-Token' : $('meta[name=_token]').attr('content') }
    }).done(function (results) {
        $(".kandyAddressBook .kandyDirSearchResults div:not(:first)").remove();
        var div = null;
        if (results.length == 0) {
            div = "<div class='kandyAddressBookNoResult'>-- No Matches Found --</div>";
            $('.kandyAddressBook .kandyDirSearchResults').append(div);
        } else {
            for (var i = 0; i < results.length; i++) {
                $('.kandyDirSearchResults').append(
                        "<div class='kandySearchItem'>" +
                        "<span class='userId'>" + results[i].main_username + "</span>" +
                        "<input type='button' value='Add Contact' onclick='kandy_addToContacts(\"" +
                        results[i].kandy_full_username + "\")' />" +
                        "</div>"
                );
            }
        }
    }).fail(function() {
        $(".kandyAddressBook .kandyDirSearchResults div:not(:first)").remove();
        var div = "<div class='kandyAddressBookNoResult'>There was an error with your request.</div>";
        $('.kandyAddressBook .kandyDirSearchResults').append(div);
    });
};

/**
 * ===================KANDY CHAT WIDGET FUNCTION ==========================
 */

/**
 * Add an example chat box
 */
var addExampleBox = function () {
    var tabId = "example";
    tabContentWrapper.append(getLiContent(tabId));
    tabContentWrapper.find('li[data-content="' + tabId + '"]').addClass('selected').find(".chat-input").attr('disabled', true);
};

/**
 * Get display name for chat content
 *
 * @param data
 * @returns {*}
 */
var getDisplayNameForChatContent = function (msg) {
  if (msg) {
    jQuery.ajax({
      url: '/kandy/getNameForChatContent',
      type: "POST",
      data: {data: msg},
      headers: { 'X-CSRF-Token' : $('meta[name=_token]').attr('content') },
      async: false
    }).done(function (response) {
      msg = response;
    }).fail(function (e) {
    });
  }
  return msg;
};

/**
 * Get display name for contacts
 *
 * @param data
 * @returns {*}
 */
var getDisplayNameForContact = function (data) {
    if (data.length) {
        $.ajax({
            url: "/kandy/getNameForContact",
            data: {data: data},
            async: false,
            headers: { 'X-CSRF-Token' : $('meta[name=_token]').attr('content') },
            type: "POST"
        }).done(function (response) {
            data = response;
        }).fail(function (e) {
        });
    }
    return data;
};

/**
 * Load Contact for KandyChat
 */
kandy_loadContacts_chat = function () {
    var contactListForPresence = [];
    kandy.addressbook.retrievePersonalAddressBook(
            function (results) {
                results = getDisplayNameForContact(results);
                emptyContact();
                for (var i = 0; i < results.length; i++) {
                    prependContact(results[i]);
                    contactListForPresence.push({full_user_id: results[i].contact_user_name});
                }

                KandyAPI.Phone.watchPresence(contactListForPresence);
                addExampleBox();
            },
            function () {
                console.log("Error");
                addExampleBox();
            }
    );

};

/**
 * Send a message with kandyChat
 */
kandy_sendIm = function (username, dataHolder) {
  var displayName = $('.kandyChat .kandy_current_username').val();
  var dataHolder = (typeof dataHolder!= 'undefined')? dataHolder : username;

  var inputMessage = $('.kandyChat .imMessageToSend[data-user="' + dataHolder + '"]');
    var message = inputMessage.val();
    inputMessage.val('');
    kandy.messaging.sendIm(username, message, function () {
                var newMessage = '<div class="my-message">\
                    <b><span class="imUsername">' + displayName + ':</span></b>\
                    <span class="imMessage">' + message + '</span>\
                </div>';
                var messageDiv = $('.kandyChat .kandyMessages[data-user="' + dataHolder + '"]');
                messageDiv.append(newMessage);
                messageDiv.scrollTop(messageDiv[0].scrollHeight);
            },
            function () {
                alert("IM send failed");
            }
    );
};

/**
 * on Message event listener callback
 * @param msg
 */
var kandy_onMessage = function(msg) {
  if(msg){
    var get_name_for_chat_content_url = jQuery(".kandyChat #get_name_for_chat_content_url").val();
    msg = getDisplayNameForChatContent(msg, get_name_for_chat_content_url);
  }
  if(msg.messageType == 'chat' && msg.contentType === 'text' && msg.message.mimeType == 'text/plain'){
    // Get user info
    var username = msg.sender.full_user_id;
    if(typeof msg.sender.user_email != "undefined" ){
      username = msg.sender.user_email;
    }
    var displayName = msg.sender.display_name;
    // Process tabs
    if (!jQuery(liTabWrapSelector + " li a[" + userHoldingAttribute + "='" + username + "']").length) {
      prependContact(msg.sender);
    }
    if (!jQuery('input.imMessageToSend').is(':focus')) {
      moveContactToTopAndSetActive(msg.sender);
    } else {
      moveContactToTop(msg.sender);
    }
    // Process message
    if ((msg.hasOwnProperty('message'))) {
      var msg = msg.message.text;
      var newMessage = '<div class="their-message">\
                            <b><span class="imUsername">' + displayName + ':</span></b>\
                            <span class="imMessage">' + msg + '</span>\
                        </div>';
      var messageDiv = jQuery('.kandyChat .kandyMessages[data-user="' + username + '"]');
      messageDiv.append(newMessage);
      messageDiv.scrollTop(messageDiv[0].scrollHeight);
    }
  }

};


/* Tab */

/**
 * Empty all contacts
 *
 */
var emptyContact = function () {
    $(liTabContactWrap).html("");
    //$(liContentWrapSelector).html("");
};

/**
 * Prepend a contact
 *
 * @param user
 */
var prependContact = function (user) {
  var isLiveChat = false;
  var username = user.contact_user_name;
  if(typeof user.user_email != "undefined"){
    isLiveChat = true;
    username = user.user_email;
  }

  var liParent = $(liTabContactWrap + " li a[" + userHoldingAttribute + "='" + username + "']").parent();
  var liContact = "";
  if(liParent.length){
    liContact =  liParent[0].outerHTML;
  } else {
    liContact = getLiContact(user);
  }
  if(!isLiveChat){
    $(liTabContactWrap).prepend(liContact);
  }else {
    if($(liTabLiveChatWrap ))
    $(liTabLiveChatWrap).prepend(liContact);
    if($(liveChatGroupSeparator).hasClass('hide')){
      $(liveChatGroupSeparator).removeClass('hide');
    }
  }
  if (!$(liContentWrapSelector + " li[" + userHoldingAttribute + "='" + username + "']").length) {
    var liContent = getLiContent(username, user.contact_user_name);
    $(liContentWrapSelector).prepend(liContent);
  }
};
/**
 * Get current active user name
 *
 * @returns {*}
 */
var getActiveContact = function () {
    return $(liTabWrapSelector + " li." + activeClass).attr(userHoldingAttribute);
};

/**
 * Set focus to a user
 *
 * @param user
 */
var setFocusContact = function (user) {
    $(liTabWrapSelector + " li a[" + userHoldingAttribute + "='" + user + "']").trigger("click");
};

/**
 * Move a contact user to top of the list
 *
 * @param user
 */
var moveContactToTop = function (user) {
    var username = user.contact_user_name;
    if(typeof user.user_email != "undefined"){
      username = user.user_email;
    }
    var contact = $(liTabWrapSelector + " li a[" + userHoldingAttribute + "='" + username + "']").parent();
    var active = contact.hasClass(activeClass);

    // Add to top
    prependContact(user, active);
    // Remove
    contact.remove();

};

/**
 * Move a contact user to top of the list set set focus to it
 *
 * @param user
 */
var moveContactToTopAndSetActive = function (user) {
    moveContactToTop(user);
    setFocusContact(user);
    $(liTabWrapSelector).scrollTop(0);
};

/**
 * Get a contact template
 *
 * @param user
 * @param active
 * @returns {string}
 */
var getLiContact = function (user, active) {
    // Set false as default
  var username = user.contact_user_name;
  var real_id = '';
  if(typeof user.user_email != 'undefined'){
    username = user.user_email;
    real_id = "data-real-id='" + user.contact_user_name + "' ";
  }
  var displayName = user.display_name;
  var id = username.replace(/[.@]/g, '_');
  var liClass = (typeof active !== 'undefined') ? active : "";
  return '<li id="' + id + '" class="' + liClass + '"><a ' + real_id + userHoldingAttribute + '="' + username + '" href="#">' + displayName + '</a><i class="status"></i></li>';
};

/**
 * Get contact content template
 *
 * @param user
 * @returns {string}
 */
var getLiContent = function (user, real_id) {
    var uid= '';
    if(typeof real_id != "undefined"){
      uid = real_id;
    }
    var result =
            '<li ' + userHoldingAttribute + '="' + user + '">\
                <div class="kandyMessages" data-user="' + user + '">\
                </div>\
                <div >\
                    Messages:\
                </div>\
                <div class="{{ $options["message"]["class"] }}">\
                            <form class="send-message" data-real-id="'+ uid + '" data-user="' + user + '">\
                        <div class="input-message">\
                            <input class="imMessageToSend chat-input" type="text" data-user="' + user + '">\
                        </div>\
                        <div class="button-send">\
                            <input class="btnSendMessage chat-input" type="submit" value="Send"  data-user="' + user + '" >\
                        </div>\
                    </form>\
                </div>\
            </li>';
    return result;
};

/**
 * Filter contact
 *
 * @param val
 */
var kandy_contactFilterChanged = function (val) {
    var liUserchat = jQuery(".kandyChat .cd-tabs-navigation li");
    jQuery.each(liUserchat, function (index, target) {
        var liClass = jQuery(target).attr('class');
        var currentClass = "kandy-chat-status-" + val;
        var currentGroupClass = "kandy-chat-status-g-" +val;
        if (val == "all") {
            jQuery(target).show();
        }
        else if (currentClass == liClass || jQuery(target).hasClass(currentGroupClass)) {
            jQuery(target).show();
        }
        else {
            jQuery(target).hide();
        }
    });
};
/**
 * Add contact
 *
 */
var addContacts = function() {
    var contactId = $("#kandySearchUserName").val();
    kandy_addToContacts(contactId);
    $("#kandySearchUserName").select2('val', '');
};


var kandy_getSessionInfo = function(sessionId, successCallback, failCallback){
    KandyAPI.Session.getInfoById(sessionId,
        function(result){
            if(typeof successCallback == 'function'){
                successCallback(result);
            }
        },
        function (msg, code) {
            if(typeof failCallback == 'function' ){
                failCallback(msg,code);
            }
        }
    )
};


/**
 * Load group details
 * @param sessionId
 */

var kandy_loadGroupDetails = function(groupId){
    kandy.messaging.getGroupById(groupId,
        function (result) {
            var isOwner = false, notInGroup = true, groupActivity = '', currentUser = $(".kandy_user").val();
            var groupAction = $(liTabWrapSelector +' li a[data-content="'+groupId+'"]').parent().find('.groupAction');
            var messageInput = $(liContentWrapSelector + ' li[data-content="'+groupId+'"] form .imMessageToSend');
            buildListParticipants(groupId, result.members, result.owners[0].full_user_id);
            //if current user is owner of this group
            if(currentUser === result.owners[0].full_user_id ){
                //add admin functionality
                isOwner = true;
                groupActivity = '<a class="" href="javascipt:;"><i title="Remove group" onclick="kandy_terminateGroup(\''+result.group_id+'\', kandy_loadGroups)" class="fa fa-remove"></i></a>';
                $(liTabWrapSelector + ' li[data-group="'+groupId+'"] ' + ' .'+ listUserClass+' li[data-user!="'+result.owners[0].full_user_id +'"] .actions').append(
                    '<i title="Remove user" class="remove fa fa-remove"></i>'
                );
            }
            //check if user is not in group
            for(var j in result.members){
                if(result.members[j].full_user_id == currentUser){
                    notInGroup = false;
                }
            }
            if(isOwner){
                groupActivity += '<a class="btnInviteUser" title="Add user" data-reveal-id="inviteModal"  href="javascript:;"><i class="fa fa-plus"></i></a>';
                //disable message input if user not belongs to a specific group
            }else {
                groupActivity = '<a class="leave" title="Leave group" onclick="kandy_leaveGroup(\''+result.group_id+'\',kandy_loadGroupDetails)" href="javascript:;"><i class="fa fa-sign-out"></i></a>';
                if(messageInput.is(':disabled')){
                    messageInput.prop('disabled',false);
                }
            }
            groupAction.html(groupActivity);

            updateUserGroupStatus();
        },
        function (msg, code) {
            console.log('Error: '+ code + ' - ' + msg);
        }
    );

};

/**
 * Build list of participants
 * @param sessionDetails
 */

var buildListParticipants = function(sessionId, participants, admin_id){
    var listUsersGroup = $(liTabWrapSelector + ' li[data-group="'+sessionId+'"] ' + ' .'+ listUserClass);
    listUsersGroup.empty();
    participants.push({full_user_id : admin_id});
    participants = getDisplayNameForContact(participants);
    var currentUser = $(".kandy_user").val();
    if(participants.length){
        for(var i in participants) {
            displayNames[participants[i].full_user_id] = participants[i].display_name;
            if(!$(listUsersGroup).find('li[data-user="'+participants[i].full_user_id+'"]').length) {
                var status = '';
                var additionBtn = '';
                var displayName = displayNames[participants[i].full_user_id];
                if(admin_id == participants[i].full_user_id){
                    displayName += '<span> (owner)</span>';
                }
                $(listUsersGroup).append(
                    '<li data-user="'+participants[i].full_user_id+'">' +
                    '<a>'+ displayName +'</a>'+
                    '<span class="actions">'+additionBtn +'</span>'+
                    '<i class="status">'+status+'</i>'+
                    '</li>'
                );
            }

        }
    }

};
/**
 * Load open group chat
 */
var kandy_loadGroups = function(){
    kandy.messaging.getGroups(
        function (result) {
            $(liTabGroupsWrap).empty();
            if(result.hasOwnProperty('groups')){
                if(result.groups.length){
                    $(groupSeparator).removeClass('hide');
                    for(var i in result.groups){
                        //build sessions list here
                        groupNames[result.groups[i].group_id] = result.groups[i].group_name;
                        if (!$(liTabGroupsWrap + " li[data-group='" + result.groups[i].group_id + "']").length){
                            $(liTabGroupsWrap).append(
                                '<li data-group="'+result.groups[i].group_id+'" class="group">'+
                                '<i class="toggle fa fa-plus-square-o"></i>'+
                                '<a data-content="'+ result.groups[i].group_id+'" href="#">'+
                                result.groups[i].group_name+
                                '</a>'+
                                '<div class="groupAction"></div>'+
                                '<ul class="list-users"></ul>'+
                                '</li>'
                            );
                        }
                        if (!$(liContentWrapSelector + " li[" + userHoldingAttribute + "='" + result.groups[i].group_id + "']").length) {
                            var liContent = getGroupContent(result.groups[i].group_id);
                            $(liContentWrapSelector).prepend(liContent);

                        }
                        kandy_loadGroupDetails(result.groups[i].group_id);
                    }
                }else{
                    $(groupSeparator).addClass('hide');
                }
            }
        },
        function (msg, code) {
            console.debug('load sessions fail. Code:'+ code +'. Message:'+msg);
        }
    );
};

/**
 *  Event handler for onData event
 */
var kandy_onGroupMessage = function(msg){
    if(typeof msg != 'undefined'){
        var msgType = msg.messageType;
        var sender = displayNames[msg.sender.full_user_id] || msg.sender.user_id;
        if(msgType == 'groupChat'){
            if(msg.contentType == 'text'){
                var newMessage = '<div class="their-message">\
                            <b><span class="imUsername">' + sender + ':</span></b>\
                            <span class="imMessage">' + msg.message.text + '</span>\
                        </div>';

                var messageDiv = $('.kandyChat .kandyMessages[data-group="'+msg.group_id+'"]');
                messageDiv.append(newMessage);
                messageDiv.scrollTop(messageDiv[0].scrollHeight);
            }

        }
    }

};
/**
 * Add member to a group
 * @param group_id
 * @param members
 */
var kandy_inviteUserToGroup = function(group_id, members){
    kandy.messaging.addGroupMembers(group_id, members,

        function(results) {
            kandy_loadGroupDetails(group_id);
        },
        function(msg, code) {
            alert('Error - something went wrong when we tried to addGroupMembers');
        }

    );
};
/**
 * on group invite user event
 */
var kandy_onGroupInvite = function() {
      kandy_loadGroups();
};

var getGroupContent = function (groupId) {
    var result =
        '<li ' + userHoldingAttribute + '="' + groupId + '">\
                <div class="kandyMessages" data-group="' + groupId + '">\
                </div>\
                <div >\
                    Messages:\
                </div>\
                <div class="">\
                            <form class="send-message" data-group="' + groupId + '">\
                        <div class="input-message">\
                            <input class="imMessageToSend chat-input" type="text" data-group="' + groupId + '">\
                        </div>\
                        <div class="button-send">\
                            <input class="btnSendMessage chat-input" type="submit" value="Send"  data-group="' + groupId + '" >\
                        </div>\
                    </form>\
                </div>\
            </li>';
    return result;
};
var kandy_createSession = function(config, successCallback, failCallback) {
    KandyAPI.Session.create(
        config,
        function(result){
            if(typeof successCallback == "function"){
                activateSession(result.session_id);
                successCallback(result);
            }
        },
        function(){
            if(typeof failCallback == "function"){
                failCallback();
            }
        }
    )
};

var changeGroupInputState = function(groupId, state) {
    var messageInput = $(liContentWrapSelector + ' li[data-content="'+groupId+'"] form .imMessageToSend');
    messageInput.prop('disabled',!!state);
};

var kandy_createGroup = function(groupName, successCallback, failCallback){
    kandy.messaging.createGroup(groupName, "", successCallback, failCallback);
};
/**
 * Send group IM
 * @param groupId
 * @param msg
 */
var kandy_sendGroupIm = function(groupId,msg){
    var username = $("input.kandy_current_username").val();
    kandy.messaging.sendGroupIm(groupId, msg,
        function() {
            var newMessage = '<div class="my-message">\
                    <b><span class="imUsername">' + username + ':</span></b>\
                    <span class="imMessage">' + msg + '</span>\
                </div>';
            var messageDiv = $('.kandyChat .kandyMessages[data-group="' + groupId + '"]');
            messageDiv.append(newMessage);
            messageDiv.scrollTop(messageDiv[0].scrollHeight);
        },
        function(msg, code) {
            console.log('Error sending Data (' + code + '): ' + msg);
        }
    );
};

/**
 * onJoinApprove event use for co-browsing session
 * @param notification
 */
var kandy_onSessionJoinApprove = function(notification){
    if(typeof sessionJoinApprovedCallback !== 'undefined'){
        sessionJoinApprovedCallback(notification.session_id);
    }
};

/**
 * Approve join session request
 * @param sessionId
 * @param userId
 * @param successCallback
 */
var kandy_ApproveJoinSession = function(sessionId, userId, successCallback){
    KandyAPI.Session.acceptJoinRequest(sessionId, userId,
        function () {
            if(typeof successCallback == "function"){
                successCallback(sessionId);
            }
        },
        function (msg, code) {
            console.log('Error:'+code+': '+msg);
        }
    );
};
/**
 * join group func - alias of join session func
 * @param sessionId
 * @param userId
 * @param successCallback
 */
var kandy_ApproveJoinGroup = function(sessionId, userId, successCallback){
    kandy_ApproveJoinSession(sessionId, userId, successCallback);
};


/**
 *
 * @param notification
 */
var kandy_onLeaveGroup = function(message){
    var leaverDisplayName =  displayNames[message.leaver] || message.split('@')[0];
    var groupId = message.group_id;
    var LoggedUser = $(".kandy_user").val();
    var notify = leaverDisplayName + ' is left';
    if (message.leaver != LoggedUser){
        kandy_loadGroupDetails(message.group_id);
    } else {
        kandy_loadGroups();
        changeGroupInputState(message.group_id, true);
    }
    var newMessage = '<div class="their-message">\
                    <span class="imMessage"><i>' +notify+ '</i></span>\
                </div>';
    var messageDiv = $('.kandyChat .kandyMessages[data-group="' + groupId + '"]');
    messageDiv.append(newMessage);
};
/**
 * user removed from group chat event
 * @param message
 */
var kandy_onRemovedFromGroup = function(message){
    var bootedUser = message.booted[0];
    var notify;
    if(bootedUser != $('.kandy_user').val()){
        notify = bootedUser.split('@')[0] + ' is removed from this group';
        kandy_loadGroupDetails(message.group_id);
    }else {
        notify = 'You are removed from this group';
        kandy_loadGroups();
        changeGroupInputState(message.group_id, true);
    }
    var newMessage = '<div class="their-message">\
                    <span class="imMessage"><i>' +notify+ '</i></span>\
                </div>';
    var messageDiv = $('.kandyChat .kandyMessages[data-group="' + message.group_id + '"]');
    messageDiv.append(newMessage);
    jQuery(liContentWrapSelector + " li[" + userHoldingAttribute + "='" + message.group_id + "']").find('.btnSendMessage').attr('disabled', true);

};

/**
 * Remove user from group
 * @param sessionId
 * @param userId
 */
var kandy_removeFromGroup = function(groupId, userId) {
    var members = [];
    members.push(userId);
    var displayName = displayNames[userId] || userId.split('@')[0];
    var confirm = window.confirm("Do you want to remove "+displayName +' from this group?');
    if(confirm){
        kandy.messaging.removeGroupMembers(groupId, members,
            function () {
                kandy_loadGroupDetails(groupId);
            },
            function (msg, code) {
                console.log(code + ': ' + msg);
            }
        );
    }
};

var activateSession = function(groupId){
    KandyAPI.Session.activate(
        groupId,
        function(){
            //success callback
            console.log('activate group successful');
        },function(){
            //fail callback
            console.log('Error activating group');
        }
    );

};

var kandy_joinSession = function (sessionId, successCallback){
    KandyAPI.Session.join(
        sessionId,
        {},
        function () {
            if(typeof successCallback == "function"){
                successCallback(sessionId);
            }
        },
        function (msg, code) {
            console.log(code + ": " + msg);
        }
    );
};

var kandy_LeaveSession= function(sessionId, successCallBack){
    KandyAPI.Session.leave(sessionId,
        '',
        function(){
            if(typeof successCallBack == 'function'){
                successCallBack(sessionId);
            }
        },
        function(){
            console.log('Leave group fail');
        }
    )
};
var kandy_leaveGroup = function(groupId, successCallback, failCallback){
    var confirm = window.confirm("Do you want to leave group "+ groupNames[groupId]);
    if(confirm){
        kandy.messaging.leaveGroup(groupId, successCallback, failCallback);
    }
};

var kandy_onJoin = function(notification){
    kandy_loadGroupDetails(notification.session_id);
};

/**
 * Terminate a session
 * @param sessionId
 */
var kandy_terminateSession = function(sessionId, successCallback){
    KandyAPI.Session.terminate(
        sessionId,
        function(){
            if(typeof successCallback == "function"){
                successCallback();
            }
        },
        function (msg, code) {
            console.log('Terminate session fail : '+code+': '+msg);
        }
    );
};

var kandy_terminateGroup = function(groupId, successCallback, failCallback){
    var confirm = window.confirm("Do you want to remove this group?");
    if(confirm){
        kandy.messaging.deleteGroup(groupId, successCallback, failCallback);
    }

};

/**
 * session terminate event callback
 * @param notification
 */
var kandy_onTerminateGroup = function(notification){
    removeGroupContent(notification.session_id);
    kandy_loadGroups();
};
/**
 * session active event callback
 * @param notification
 */
var kandy_onActiveGroup = function(notification){
    kandy_loadGroups();
};
/**
 * Clean things up after remove group
 * @param sessionId
 */
var removeGroupContent = function(sessionId){
    var toBeRemove = $(liContentWrapSelector + ' li[data-content="'+sessionId+'"]');
    if(toBeRemove.hasClass('selected')){
        toBeRemove.siblings('[data-content="example"]').addClass('selected');
    }
    toBeRemove.remove();
};

var updateUserGroupStatus = function (){
    if(usersStatus){
        if(jQuery(liTabGroupsWrap).length){
            for(var u in usersStatus){
                var liUserGroup = jQuery(liTabGroupsWrap + ' li[data-user="'+u+'"]');
                var status = usersStatus[u].replace(/ /g,'-').toLowerCase();
                liUserGroup.find('i.status').html(usersStatus[u]);
                liUserGroup.removeClass();
                liUserGroup.addClass('kandy-chat-status-' + status );
                liUserGroup.attr('title', usersStatus[u]);
                jQuery(liUserGroup).closest("li[data-group]").addClass('kandy-chat-status-g-'+status);
            }

        }
    }
};


var kandy_make_pstn_call = function (target){
    var kandyButtonId = $(target).data('container');
    activeContainerId = kandyButtonId;
    KandyAPI.Phone.makePSTNCall($('#'+kandyButtonId+' #psntCallOutNumber').val(), 'demo');
    if(typeof kandy_pstn_callback == "function"){
        kandy_pstn_callback();
    }

    changeAnswerButtonState("CALLING", '#'+ kandyButtonId);
};

var kandy_getOpenSessionsByType = function(sessionType, successCallback){
    KandyAPI.Session.getOpenSessionsByType (
        sessionType,
        function(result){
            if(typeof successCallback == "function") {
                successCallback(result.sessions);
            }
        },
        function(msg, code){

        }
    );
};
var getCoBrowsingSessions = function() {
    kandy_getOpenSessionsByType('cobrowsing', loadSessionList);
};

var kandy_startCoBrowsing = function(sessionId) {
    KandyAPI.CoBrowse.startBrowsingUser(sessionId);
};

var kandy_stopCoBrowsing = function() {
    KandyAPI.CoBrowse.stopBrowsingUser();
};
/**
 * @param sessionId
 * @param holder - id of browsing holder
 */
var kandy_startCoBrowsingAgent = function(sessionId, holder) {
    KandyAPI.CoBrowse.startBrowsingAgent(sessionId, holder);
};

var kandy_stopCoBrowsingAgent = function() {
    KandyAPI.CoBrowse.stopBrowsingAgent();
};
/**
 * on join request callback, currently use for co-browser
 * @param notification
 */
var kandy_onSessionJoinRequest = function(notification) {
    var message = 'User '+notification.full_user_id+' request to join session '+ sessionNames[notification.session_id];
    var confirm = window.confirm(message);
    if(confirm){
        kandy_ApproveJoinSession(notification.session_id, notification.full_user_id);
    }else{
        console.log("join request has been disapprove");
    }
};

var kandy_sendSms = function(receiver, sender, message, successCallback, errorCallback) {
    KandyAPI.Phone.sendSMS(
        receiver,
        sender,
        message,
        function() {
            if(typeof successCallback == 'function'){
                successCallback();
            }
        },
        function(message, status) {
            if(typeof errorCallback == 'function'){
                errorCallback(message, status);
            }
        }
    );
};

var heartBeat = function(interval){
  return setInterval(function(){
    $.get('/kandy/stillAlive');
  },parseInt(interval));
};

var kandy_updateUserStatus = function(status) {
  if(typeof status == 'undefined'){
    status = USER_STATUS_OFFLINE;
  }
  $.ajax({
    url: '/kandy/updateUserStatus',
    async: false,
    data: {'status': status}
  });
};

// ======================JQUERY READY =======================
$(document).ready(function () {
    setup();
    login();
    if(($('.kandyChat').length > 0 || $('#coBrowsing').length > 0) && typeof $.fn.dialog == 'undefined') {
      alert('Kandy require jquery ui.');
    }
    $(".select2").select2({
        ajax: {
            quietMillis: 100,
            url: "/kandy/getUsersForSearch",
            dataType: 'json',
            delay: 250,
            headers: { 'X-CSRF-Token' : $('meta[name=_token]').attr('content') },
            data: function (params) {
                return {
                    q: params
                };
            },
            results: function (data) {
                return {results: data.results};
            }
        },
        minimumInputLength: 1
    });

    $(".btnInviteUser").live('click', function(){
        //$("#inviteModal").attr('data-group', $(this).closest('li.group').data('group')).foundation('reveal', 'open');
        $(".kandy-invite-dialog").attr('data-group', jQuery(this).closest('li.group').data('group'));
        $('.kandy-invite-dialog').dialog('open');
    });

    $(".btnOpenModalCreateGroup").live('click', function(){
        if(typeof openDialogCreateGroup == "function") {
            openDialogCreateGroup();
        } else {
            console.error('You must define your own openDialogCreateGroup function to open "create group" dialog');
        }
    })
});
