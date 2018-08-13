$(document).ready(function() {
    var client, player, remotePeer, remoteStreamingDevice, connected;
    var streamType;

    //
    // WebRTC player

    function recreatePlayer() {
        console.log('Recreate player:', player);
        destroyPlayer();

        player = new Symple.Player({
            element: '#webrtc-video .video-player',
            engine: 'WebRTC',
            rtcConfig: WEBRTC_CONFIG,
            iceMediaConstraints: {
                'mandatory': {
                    'OfferToReceiveAudio': true,
                    'OfferToReceiveVideo': true
                }
            },
            onStateChange: function(player, state) {
                player.displayStatus(state);
            }
        });
        player.setup();
    }

    function destroyPlayer() {
        if (player) {
            player.destroy()
            player = null;
        }
    }


    //
    //= Commands

    // Get a list of streaming devices from the peer
    var refreshStreamingDevices = function(peer) {
        var command = {};
        command["node"] = (streamType === "file") ? "streaming:files" : "streaming:devices";
        command["to"] = peer;
        client.sendCommand(command);
    };

    // Start streaming video from the peer
    var startStreaming = function(peer, source) {
        recreatePlayer();
        var command = {};
        command["node"] = "streaming:start";
        command["to"] = peer;   
        command["data"] = {};
        command["data"][streamType] = source;
        remoteStreamingDevice = source;
        client.sendCommand(command);
    };

    // Stop streaming video from the peer
    var stopStreaming = function(peer, source) {
        destroyPlayer();

        var command = {};
        command["node"] = "streaming:stop";
        command["to"] = peer;
        command["data"] = {};
        command["data"][streamType] = source;
        remoteStreamingDevice = null;
        client.sendCommand(command);
    };


    //
    // Bind UI events

    $('#stream').on('click', 'a', function(event) {
        var $this = $(this),
            user = $this.data('user'),
            device = $this.data('device'),
            isActive = $this.hasClass('active');
        if (isActive) {
            $this.removeClass('active');
            //streamType = "undefined";
            stopStreaming(user, device);
        }
        else {
            $this.addClass('active').siblings().removeClass('active');
            startStreaming(user, device);
        }

        event.preventDefault();
    });

    $("#stream-start").click(function() {
        var action = $("#stream-start").attr('value');
        var $devs = $('#stream a');
        if(action === 'Start') {
            streamType = $('input:radio[name=stream-type]:checked').val();
            if(streamType===undefined ) {
                alert('Please select one options!');
                return;
            }
            //$('#stream').empty();
            $("#stream-start").attr('value', 'Stop');
            if(connected === undefined) {
                connected = true;
                client.connect();
            }
            else { 
                refreshStreamingDevices($devs.data('user')); 
            }
        } else {
            $("#stream-start").attr('value', 'Start');
            var user = $devs.data('user'),
                device = $devs.data('device'),
                isActive = $devs.hasClass('active');
            if (isActive) {
                $('#stream').empty();
                $devs.removeClass('active');
                stopStreaming(user, device);
            } 
        }
        $('input:radio[name=stream-type]:checked').prop('checked', false);
    });

    //
    // Symple client

    client = new Symple.Client(CLIENT_OPTIONS);

    client.on('announce', function(peer) {
        // console.log('Authentication success:', peer);
    });

    client.on('presence', function(p) {
        // console.log('Recv presence:', p);

        // Handle presence packets from peers
    });

    client.on('message', function(m) {
        // console.log('Recv message:', m);

        // Handle messages from peers
    });

    client.on('command', function(c) {
        // console.log('Recv command:', c)

        if (remotePeer && remotePeer.id != c.from.id) {
            console.log('Dropping message from unknown peer', m);
            return;
        }

        if (c.node == 'streaming:start') {
            if (c.status == 200) {
                // Streaming start success response
                // TODO: Update button state?
                // createPlayer();
            }
            else {
                // Command error
            }
        }

        else if (c.node == 'streaming:devices') {
            if (c.status == 200) {
                // Add new devices to the list
                var $devs = $('#stream');
                //$devs.empty();
                for (var i = 0; i < c.data.devices.length; i++) {
                    var dev = c.data.devices[i];
                    if (!$devs.find('[data-device="' + dev + '"]').length)
                        $devs.append('<a href="#" data-user="' + c.from.user + '" data-device="' + dev + '" ' +
                            'class="list-group-item list-group-item-action">' + c.from.user + ': ' + dev + '</a>'); 
                }
            }
            else {
                // Command error
            }
        }

        else if (c.node == 'streaming:files') {
            // TODO: file streaming
            if (c.status == 200) {
                // Add new devices to the list
                var $devs = $('#stream');
                //$devs.empty();
                for (var i = 0; i < c.data.files.length; i++) {
                    var file = c.data.files[i];
                    if (!$devs.find('[data-device="' + file + '"]').length)
                        $devs.append('<a href="#" data-user="' + c.from.user + '" data-device="' + file + '" ' +
                            'class="list-group-item list-group-item-action">' + c.from.user + ': ' + file + '</a>');
                } 
            }
            else {
                // Command error
            }
        }
    });

    client.on('event', function(e) {
        // console.log('Recv event:', e)

        // Just handle events from he current streaming peer
        // for the porpose of this demo
        if (remotePeer && remotePeer.id != e.from.id) {
            console.log('Dropping message from unknown peer', m);
            return;
        }

        // ICE SDP
        if (e.name == 'ice:sdp') {
             try {
                console.log('Reieve offer:', e.sdp);

                remotePeer = e.from;
                player.play();
                player.engine.recvRemoteSDP(e.sdp);
                player.engine.sendLocalSDP = function(desc) {
                    console.log('Send answer:', desc)
                    client.send({
                        to: remotePeer,
                        name: 'ice:sdp',
                        type: 'event',
                        sdp: desc
                    });
                }

                player.engine.sendLocalCandidate = function(cand) {
                    client.send({
                        to: remotePeer,
                        name: 'ice:candidate',
                        type: 'event',
                        candidate: cand
                    });
                }
            }
            catch (e) {
                console.log("Failed to create PeerConnection:", e);
            }

            // if (e.sdp.type == 'offer') {

            //     // Create the remote player on offer
            //     if (!$scope.remotePlayer) {
            //         $scope.remotePlayer = createPlayer($scope, 'answerer', '#video .remote-video');
            //         $scope.remotePlayer.play();
            //     }
            //     $scope.remotePlayer.engine.recvRemoteSDP(e.sdp);
            // }
            // if (e.sdp.type == 'answer') {
            //     $scope.localPlayer.engine.recvRemoteSDP(e.sdp);
            // }
        }

        // ICE Candidate
        else if (e.name == 'ice:candidate') {
            console.log('Recreate player:', player);
            player.engine.recvRemoteCandidate(e.candidate);

            // if (e.origin == 'answerer')
            //     $scope.localPlayer.engine.recvRemoteCandidate(e.candidate);
            // else //if (e.origin == 'caller')
            //     $scope.remotePlayer.engine.recvRemoteCandidate(e.candidate);
            // // else
            //     alert('Unknown candidate origin');
        }

        else {
            alert('Unknown event: ' + e.name);
        }
    });

    // client.on('event', function(e) {
    //    console.log('Recv event:', e)
    // });

    client.on('disconnect', function() {
        // console.log('Disconnected from server')
        //streamType = "undefined";
    });

    client.on('error', function(error, message) {
        // console.log('Peer error:', error, message)
    });

    client.on('addPeer', function(peer) {
        // console.log('Adding peer:', peer)

        // Get a list of streaming devices as soon as the peer connects
        if (peer.type == 'demo') {
           refreshStreamingDevices(peer);
        }
    });

    client.on('removePeer', function(peer) {
        // console.log('Removing peer:', peer)
        $('[data-user="' + peer.user + '"]').remove();
        if (remotePeer && remotePeer.id == peer.id) {
            remotePeer = null;
            destroyPlayer();
        }
    });

    //client.connect();
});
