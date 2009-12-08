#
#   Copyright © 2008, Dmitry Titov, Vitaly Puzrin
#   http://wildev.ru, http://rcdesign.ru
#
# ==============================================================================
#

  package RCD::NNTP::Plugins::ARTICLE;

    #
    #   ARTICLE handler
    #

    use strict;
    use Exporter qw(import);
    use Storable qw(freeze thaw);
    use MIME::Base64 qw(encode_base64 decode_base64);
    use base qw(RCD::NNTP::Base::Plugin);

    our $VERSION = "0.03"; # $Date: 2009/11/02 17:05:15 $

    our @EXPORT    = qw();
    our @EXPORT_OK = qw(parse_message_id);


    sub init
    {
      my $self = shift;

      #
      #   Commands handled by this module
      #

      $self->{COMMANDS} = {
          # command => sub
          'article' => 'cmd_article',
          'head'    => 'cmd_head'   ,
          'body'    => 'cmd_body'   ,
        };

      1;
    }


    sub cmd_article { article_handler( 'all' , @_ ) }
    sub cmd_head    { article_handler( 'head', @_ ) }
    sub cmd_body    { article_handler( 'body', @_ ) }


    #   ========================================================================
    #
    #     RFC 977
    #     http://www.faqs.org/rfcs/rfc977.html
    #
    #   ------------------------------------------------------------------------
    #
    #   3.1.  The ARTICLE, BODY, HEAD, and STAT commands
    #
    #   3.1.1.  ARTICLE (selection by message-id)
    #
    #     Input parameters:
    #
    #       <message-id>
    #
    #       Message-id is, for example: <groupid>.<messageid>@<groupid>
    #
    #       The internally-maintained "current article pointer"
    #       is NOT ALTERED by this command.
    #
    #   3.1.2.  ARTICLE (selection by number)
    #
    #     Input parameters:
    #
    #       [<nnn>]
    #
    #       <nnn> (optional, integer) is the message number within selected
    #       group.
    #
    #   3.1.3.  Responses
    #
    #     220 n <a> article retrieved - head and body follow
    #             (n = article number, <a> = message-id)
    #     221 n <a> article retrieved - head follows
    #     222 n <a> article retrieved - body follows
    #     223 n <a> article retrieved - request text separately
    #     412 no newsgroup has been selected
    #     420 no current article has been selected
    #     423 no such article number in this group
    #     430 no such article found
    #
    #
    #     BODY, HEAD, and STAT are handled in the same way.
    #


    sub article_handler
    {
      my $subj = shift;
      my $self = shift;

      my ( $uuid, $id ) = @_;

      if( $self->check_conditions( $uuid ) )
      {
        # is it required to set internal atricle pointer?
        my $set_message_id = 0;

        my ( $groupid, $messageid, $gateid ) = ( undef, undef, '' );

        my $res = $self->parse_message_id( $uuid, $id );

        $groupid   = $res->{groupid}  ;
        $messageid = $res->{messageid};
        $gateid    = $res->{gateid}   ;

        $set_message_id = $res->{setid}
          if $res->{setid};

        if( ! $groupid )
        {
          #
          #   No group selected
          #

          $self->WriteClient(
              $uuid,
              '412 no newsgroup has been selected'
            );

          return;
        }

        if( ! $messageid )
        {
          #
          #   No message selected
          #

          $self->WriteClient(
              $uuid,
              '420 no current article has been selected'
            );

          return;
        }

        my $message = $self->forum( $uuid )->do( {
            do            => 'article',
            auth_ok       => 'yes',
            nntp_username => $self->client( $uuid )->{username},
            nntp_userid   => $self->client( $uuid )->{userid}  ,
            access        => $self->client( $uuid )->{access}  ,
            messageid     => $messageid ,
            groupid       => $groupid   ,
            gateid        => $gateid    ,
            subj          => $subj      , # all/head/body
          } );

        if( $message && ref( $message ) eq 'HASH' )
        {
          #
          #   Set current pointer if requested
          #

          $self->client( $uuid )->{messageid} = $messageid
            if $set_message_id;

          #
          #   Add message id to headers
          #

          $message->{headers}->{'Message-ID'} =
              '<'
              . $self->build_message_id(
                    $message->{groupid}   ,
                    $message->{messageid} ,
                    $message->{gateid}    ,
                  )
              . '>';

          #
          #   Reference id
          #

          $message->{headers}->{'References'} =
              '<'
              . $self->build_ref_id(
                    $message->{groupid}   ,
                    $message->{refid}     ,
                    $message->{gateid}    ,
                  )
              . '>';

          my $message_id =
            ( $res->{matched} eq 'messageid' ? 0 : $messageid )
            . ' ' . $message->{headers}->{'Message-ID'};

          my $status_response =
            $subj eq 'all'  ? "220 $message_id" :
            $subj eq 'head' ? "221 $message_id" :
            $subj eq 'body' ? "222 $message_id" : "";

          $self->WriteClient(
              $uuid,
              $status_response,
            );

          #
          #   Print headers
          #

          if( $subj eq 'all' || $subj eq 'head' )
          {
            #
            #   Additional headers
            #

            $message->{headers}->{'MIME-Version'}              = '1.0';
            $message->{headers}->{'Content-Transfer-Encoding'} = 'base64';

            #
            #   Print headers
            #

            foreach my $key ( keys %{ $message->{headers} } )
            {
              $self->WriteClient(
                  $uuid,
                  $key . ': ' . $message->{headers}->{$key},
                );
            }

            unless( $subj eq 'head' )
            {
              #
              #   Blank line indication headers end and body start
              #

              $self->WriteClient(
                  $uuid,
                  '',
                );
            }
          }

          #
          #   Print body
          #

          if( $subj eq 'all' || $subj eq 'body' )
          {
            #
            #   Get message template, css and menu
            #

            my $tmpl = $self->msgtemplate( $uuid, $message->{groupid} );
            my $css  = $self->css( $uuid, $message->{groupid} );
            my $menu = $self->menu( $uuid, $message->{groupid} );
            my $body = $message->{body};

            $menu    = $self->replace_parameters(
                $menu,
                'POST ID'   => $message->{postid},
                'THREAD ID' => $message->{refid},
              );

            #
            #   Replace message text with demo text and cut menu
            #   if user have only demo access to the gate
            #

            $self->{Toolkit}->Logger->debug(
                'Inspecting client for demo access level and message id '
                . 'for demo access: '
                . $self->client( $uuid )->{access}
                . '-'
                . $messageid . '[' . $message->{messageid} . ']'
              );

            if( $self->client( $uuid )->{access} eq 'demo' )
            {
              $body = $self->demo( $uuid ) . $body;

              $self->{Toolkit}->Logger->debug(
                  'Message (id ' . $messageid . ') text prepended with demo text'
                );
            }

            my $msg = $self->replace_parameters(
                $tmpl,
                'CSS'          => $css ,
                'USER MENU'    => $menu,
                'MESSAGE BODY' => $body,
              );

            #
            #   Print body
            #

            $self->WriteClient(
                $uuid,
                encode_base64( $msg ),
              );
          }

          $self->WriteClient(
              $uuid,
              '.',
            );
        }
        elsif( !ref( $message )
               && $message eq 'no such article'
               && !$set_message_id )
        {
          #
          #   No such message found by message id
          #

          $self->client( $uuid )->{messageid} = undef;

          $self->WriteClient(
              $uuid,
              '430 no such article found'
            );
        }
        elsif( !ref( $message )
               && $message eq 'no such article'
               &&  $set_message_id )
        {
          #
          #   No such message found by group id + message number
          #

          $self->client( $uuid )->{messageid} = undef;

          $self->WriteClient(
              $uuid,
              '423 no such article number in this group'
            );
        }
        else
        {
          #
          #   server error, inform client
          #

          $self->WriteClient(
              $uuid,
              '503 program fault - command not performed'
            );
        }
      }

      return;
    }


    #
    #   Parse given message id following RFC 977
    #   Used by commands: ARTICLE, XHDR
    #
    #   Input parameters:
    #     uuid - Connection ID
    #     id   - message id, could be <message-id> or <nnn> or empty.
    #
    #   Outputs hash with:
    #
    #     <groupid>   - group id
    #     <messageid> - message number in the group
    #     <gateid>    - gate id (text)
    #     <setid>     - flag (to set or not internal pointer
    #     <matched>   - name of the rule that parsed the input <id>
    #

    sub parse_message_id
    {
      my $self  = shift;
      my $uuid  = shift;
      my $id    = shift || '';
      my $res   = {};

      if   ( $id =~ /^<(\d+)\D(\d+)@([^>]+)>$/ )
      {
        #
        #   the message-id
        #

        $res->{groupid} = $1;
        $res->{id}      = $2;
        $res->{gateid}  = $3;

        $res->{matched} = 'messageid';
      }
      elsif( $id =~ /^(\d+)$/ )
      {
        #
        #   the numeric id of an article
        #

        $res->{id}   = $1;

        $res->{groupid} = $self->client( $uuid )->{groupid};

        $res->{setid}   = 1;

        $res->{matched} = 'messagenum';
      }
      elsif( ! length( $id ) )
      {
        #
        #   article number is the actual pointer if present
        #

        $res->{id} = $self->client( $uuid )->{messageid}
          if $self->client( $uuid )->{messageid};

        $res->{groupid} = $self->client( $uuid )->{groupid};

        $res->{matched} = 'empty';
      }

      $res->{messageid} = $res->{id}
        if $res->{id};

      #
      #   Verify if access to this group is granted to user
      #

      if( scalar keys %{ $res } )
      {
        $res->{groupid} = undef
          unless $self->client( $uuid )->{groupids}->{ $res->{groupid} };
      }

      $res;
    }


    #
    #   Returns message template for given group id
    #

    sub msgtemplate ($)
    {
      my $self = shift;
      my $uuid = shift;

      $self->client( $uuid )->{tmpl};
    }


    sub css ($)
    {
      my $self = shift;
      my $uuid = shift;

      $self->client( $uuid )->{css};
    }


    sub menu ($)
    {
      my $self = shift;
      my $uuid = shift;

      $self->client( $uuid )->{menu};
    }


    sub demo ($)
    {
      my $self = shift;
      my $uuid = shift;

      $self->client( $uuid )->{demotext};
    }


# end of the RCD::NNTP::Plugins::ARTICLE package

1;
